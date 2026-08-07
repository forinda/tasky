import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { Container } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { SqliteAdapter } from '@/adapters/sqlite.adapter'
import { authRateLimitStore } from '@/modules/auth/auth.controller'
import { AuthModule } from '@/modules/auth/auth.module'
import { TasksModule } from '@/modules/tasks/tasks.module'
import { CategoriesModule } from '../categories.module'

beforeEach(() => {
  Container.reset()
  // The auth limiter is one counter shared by the whole module; every test here
  // signs up twice, so without this later tests collect spurious 429s.
  authRateLimitStore.resetAll()
})

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

/**
 * Two users on ONE app instance — the only setup that can prove isolation.
 * Separate apps would pass even with every ownership predicate deleted.
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
    return res.body.token as string
  }

  return {
    expressApp,
    alice: await signup('alice@example.com'),
    bob: await signup('bob@example.com'),
  }
}

type App = Awaited<ReturnType<typeof twoUsers>>['expressApp']

async function makeCategory(app: App, token: string, name: string) {
  const res = await request(app).post('/api/v1/categories').set(auth(token)).send({ name })
  return res.body.id as string
}

async function makeTask(app: App, token: string, title: string, categoryIds: string[] = []) {
  const res = await request(app).post('/api/v1/tasks').set(auth(token)).send({ title, categoryIds })
  return res.body.id as string
}

describe('GET /categories/:id/tasks', () => {
  it('returns only the tasks in that category', async () => {
    const { expressApp, alice } = await twoUsers()
    const work = await makeCategory(expressApp, alice, 'Work')
    const home = await makeCategory(expressApp, alice, 'Home')
    await makeTask(expressApp, alice, 'In work', [work])
    await makeTask(expressApp, alice, 'In home', [home])
    await makeTask(expressApp, alice, 'Uncategorised')

    const res = await request(expressApp).get(`/api/v1/categories/${work}/tasks`).set(auth(alice))

    expect(res.status).toBe(200)
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(['In work'])
    // total is the category's total, not the owner's three tasks.
    expect(res.body.meta.total).toBe(1)
  })

  it('paginates, with total scoped to the category', async () => {
    const { expressApp, alice } = await twoUsers()
    const work = await makeCategory(expressApp, alice, 'Work')
    const other = await makeCategory(expressApp, alice, 'Other')
    for (const n of [1, 2, 3]) await makeTask(expressApp, alice, `Work ${n}`, [work])
    await makeTask(expressApp, alice, 'Noise', [other])

    const page1 = await request(expressApp)
      .get(`/api/v1/categories/${work}/tasks?page=1&limit=2`)
      .set(auth(alice))
    const page2 = await request(expressApp)
      .get(`/api/v1/categories/${work}/tasks?page=2&limit=2`)
      .set(auth(alice))

    expect(page1.body.data).toHaveLength(2)
    expect(page2.body.data).toHaveLength(1)
    // 3, not 4 — a total counted outside the join would include 'Noise' and
    // hand the client a page count it can never fill.
    expect(page1.body.meta.total).toBe(3)
    expect(page1.body.meta.totalPages).toBe(2)
    const seen = [...page1.body.data, ...page2.body.data].map((t: { title: string }) => t.title)
    expect(seen.sort()).toEqual(['Work 1', 'Work 2', 'Work 3'])
  })

  it('returns an empty page for a category with no tasks, not a 404', async () => {
    const { expressApp, alice } = await twoUsers()
    const empty = await makeCategory(expressApp, alice, 'Empty')

    const res = await request(expressApp).get(`/api/v1/categories/${empty}/tasks`).set(auth(alice))

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.meta.total).toBe(0)
  })

  it('a task in two categories appears under each', async () => {
    const { expressApp, alice } = await twoUsers()
    const work = await makeCategory(expressApp, alice, 'Work')
    const urgent = await makeCategory(expressApp, alice, 'Urgent')
    const id = await makeTask(expressApp, alice, 'Both', [work, urgent])

    for (const category of [work, urgent]) {
      const res = await request(expressApp)
        .get(`/api/v1/categories/${category}/tasks`)
        .set(auth(alice))
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].id).toBe(id)
      // Each response carries the task's FULL category set, not just the one
      // being browsed — otherwise the client sees a different task per URL.
      expect(res.body.data[0].categoryIds.sort()).toEqual([work, urgent].sort())
    }
  })

  it('another user’s category id 404s with a body identical to a missing id', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const hers = await makeCategory(expressApp, alice, 'Work')
    await makeTask(expressApp, alice, 'Secret plan', [hers])

    const othersId = await request(expressApp)
      .get(`/api/v1/categories/${hers}/tasks`)
      .set(auth(bob))
    const missingId = await request(expressApp)
      .get('/api/v1/categories/definitely-not-a-real-id/tasks')
      .set(auth(bob))

    expect(othersId.status).toBe(404)
    expect(othersId.status).toBe(missingId.status)
    // Matching status is not enough: any difference in the body still tells an
    // attacker "exists, but not yours".
    expect(othersId.body).toEqual(missingId.body)
    expect(JSON.stringify(othersId.body)).not.toContain('Secret plan')
  })

  it('rejects a request with no token', async () => {
    const { expressApp, alice } = await twoUsers()
    const work = await makeCategory(expressApp, alice, 'Work')

    const res = await request(expressApp).get(`/api/v1/categories/${work}/tasks`)

    expect(res.status).toBe(401)
  })
})
