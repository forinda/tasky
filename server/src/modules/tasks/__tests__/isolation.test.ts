import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { Container } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { SqliteAdapter } from '@/adapters/sqlite.adapter'
import { authRateLimitStore } from '@/modules/auth/auth.controller'
import { AuthModule } from '@/modules/auth/auth.module'
import { CategoriesModule } from '@/modules/categories/categories.module'
import { TasksModule } from '../tasks.module'

beforeEach(() => {
  Container.reset()
  // The signup limiter counts per module, not per app instance. Two signups a
  // test would trip max:10 part-way through this file and the later cases
  // would fail with 429s that look like isolation bugs.
  authRateLimitStore.resetAll()
})

/**
 * Two users on ONE app instance — the only setup that can prove isolation.
 * Separate apps would pass trivially even with every ownership predicate
 * removed, because each would have its own database.
 */
async function twoUsers() {
  const { expressApp } = await createTestApp({
    modules: [AuthModule(), CategoriesModule(), TasksModule()],
    adapters: [SqliteAdapter()],
  })

  async function signup(email: string) {
    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'hunter2hunter2', name: email })
    return res.body.accessToken as string
  }

  return {
    expressApp,
    alice: await signup('alice@example.com'),
    bob: await signup('bob@example.com'),
  }
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

const createTask = (
  app: Parameters<typeof request>[0],
  token: string,
  body: Record<string, unknown>,
) => request(app).post('/api/v1/tasks').set(auth(token)).send(body)

describe('cross-user task isolation', () => {
  it('Bob cannot see Alice’s tasks in his list', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    await createTask(expressApp, alice, { title: 'Alice Secret' })

    const res = await request(expressApp).get('/api/v1/tasks').set(auth(bob))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
    // The count query is a separate statement from the page query — an owner
    // predicate on one and not the other still leaks that Alice has tasks.
    expect(res.body.meta.total).toBe(0)
    expect(JSON.stringify(res.body)).not.toContain('Alice Secret')
  })

  it('Bob cannot fetch Alice’s task by id', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const hers = await createTask(expressApp, alice, { title: 'Alice Secret' })

    const res = await request(expressApp).get(`/api/v1/tasks/${hers.body.id}`).set(auth(bob))

    // 404, not 403 — a 403 would confirm the id exists.
    expect(res.status).toBe(404)
    expect(JSON.stringify(res.body)).not.toContain('Alice Secret')
  })

  it('Bob cannot update Alice’s task, and it is unchanged', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const hers = await createTask(expressApp, alice, { title: 'Alice Secret', status: 'todo' })

    const attempt = await request(expressApp)
      .put(`/api/v1/tasks/${hers.body.id}`)
      .set(auth(bob))
      .send({ title: 'Hijacked', status: 'done' })

    expect(attempt.status).toBe(404)

    const stillHers = await request(expressApp)
      .get(`/api/v1/tasks/${hers.body.id}`)
      .set(auth(alice))
    expect(stillHers.status).toBe(200)
    expect(stillHers.body.title).toBe('Alice Secret')
    expect(stillHers.body.status).toBe('todo')
  })

  it('Bob cannot delete Alice’s task, and it survives', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const hers = await createTask(expressApp, alice, { title: 'Alice Secret' })

    const attempt = await request(expressApp)
      .delete(`/api/v1/tasks/${hers.body.id}`)
      .set(auth(bob))
    expect(attempt.status).toBe(404)

    const stillHers = await request(expressApp).get('/api/v1/tasks').set(auth(alice))
    expect(stillHers.body.data).toHaveLength(1)
    expect(stillHers.body.data[0].title).toBe('Alice Secret')
  })

  it('Bob cannot attach Alice’s category to his own task', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const herCategory = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(alice))
      .send({ name: 'Alice Work' })

    const attempt = await createTask(expressApp, bob, {
      title: 'Bob Task',
      categoryIds: [herCategory.body.id],
    })

    // 422 — the id is rejected as unknown. Owning the task being written is
    // not enough; every id in the payload has to be his too.
    expect(attempt.status).toBe(422)

    const his = await request(expressApp).get('/api/v1/tasks').set(auth(bob))
    // The whole write is refused, not partially applied without the link.
    expect(his.body.data).toHaveLength(0)
  })

  it('a 404 for Alice’s task id is indistinguishable from a 404 for a missing id', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const hers = await createTask(expressApp, alice, { title: 'Alice Secret' })

    const othersId = await request(expressApp).get(`/api/v1/tasks/${hers.body.id}`).set(auth(bob))
    const missingId = await request(expressApp)
      .get('/api/v1/tasks/definitely-not-a-real-id')
      .set(auth(bob))

    expect(othersId.status).toBe(missingId.status)
    // Matching status is not enough: if the bodies differ at all, an attacker
    // can still tell "exists but not yours" from "does not exist" and
    // enumerate ids.
    expect(othersId.body).toEqual(missingId.body)

    // Same for the write routes, where a rejected patch is the likelier oracle.
    const othersUpdate = await request(expressApp)
      .put(`/api/v1/tasks/${hers.body.id}`)
      .set(auth(bob))
      .send({ title: 'X' })
    const missingUpdate = await request(expressApp)
      .put('/api/v1/tasks/definitely-not-a-real-id')
      .set(auth(bob))
      .send({ title: 'X' })

    expect(othersUpdate.status).toBe(missingUpdate.status)
    expect(othersUpdate.body).toEqual(missingUpdate.body)
  })

  it('Bob’s filtered and searched lists never reach Alice’s tasks', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    await createTask(expressApp, alice, {
      title: 'Alice Secret',
      description: 'shared word',
      status: 'todo',
      priority: 'high',
    })
    await createTask(expressApp, bob, {
      title: 'Bob Task',
      description: 'shared word',
      status: 'todo',
      priority: 'high',
    })

    // A filter narrows within the owner scope; it must never widen past it.
    for (const query of [
      '?filter=status:eq:todo',
      '?filter=priority:eq:high',
      '?filter=status:eq:todo&filter=priority:eq:high',
      '?q=shared word',
      '?q=Alice',
      '?filter=status:eq:todo&q=shared word',
      '?sort=priority:asc&limit=100',
    ]) {
      const res = await request(expressApp).get(`/api/v1/tasks${query}`).set(auth(bob))

      expect(res.status, query).toBe(200)
      expect(JSON.stringify(res.body), query).not.toContain('Alice Secret')
      expect(res.body.data.every((t: { title: string }) => t.title === 'Bob Task'), query).toBe(true)
    }

    // `?q=Alice` matches nothing of Bob's — proving the previous assertions
    // were not vacuous because search was ignored outright.
    const alicesTerm = await request(expressApp).get('/api/v1/tasks?q=Alice').set(auth(bob))
    expect(alicesTerm.body.data).toHaveLength(0)
    const bobsTerm = await request(expressApp).get('/api/v1/tasks?q=Bob').set(auth(bob))
    expect(bobsTerm.body.data).toHaveLength(1)
  })
})
