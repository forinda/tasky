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
  authRateLimitStore.resetAll()
})

/** Two users on ONE app instance — separate apps would pass trivially. */
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

  return { expressApp, alice: await signup('alice@example.com'), bob: await signup('bob@example.com') }
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

type App = Awaited<ReturnType<typeof twoUsers>>['expressApp']

const newCategory = async (app: App, token: string, name: string) =>
  (await request(app).post('/api/v1/categories').set(auth(token)).send({ name })).body.id as string

const newTask = async (app: App, token: string, body: Record<string, unknown>) =>
  (await request(app).post('/api/v1/tasks').set(auth(token)).send(body)).body.id as string

const titles = (res: { body: { data: Array<{ title: string }> } }) =>
  res.body.data.map((t) => t.title).sort()

describe('?filter=categoryId', () => {
  it('returns only tasks linked to that category', async () => {
    const { expressApp, alice } = await twoUsers()
    const work = await newCategory(expressApp, alice, 'Work')
    const home = await newCategory(expressApp, alice, 'Home')

    await newTask(expressApp, alice, { title: 'in work', categoryIds: [work] })
    await newTask(expressApp, alice, { title: 'in home', categoryIds: [home] })
    await newTask(expressApp, alice, { title: 'uncategorized' })

    const res = await request(expressApp)
      .get(`/api/v1/tasks?filter=categoryId:eq:${work}`)
      .set(auth(alice))

    expect(res.status).toBe(200)
    expect(titles(res)).toEqual(['in work'])
  })

  it('counts a task in two categories ONCE', async () => {
    const { expressApp, alice } = await twoUsers()
    const work = await newCategory(expressApp, alice, 'Work')
    const urgent = await newCategory(expressApp, alice, 'Urgent')

    await newTask(expressApp, alice, { title: 'both', categoryIds: [work, urgent] })

    const res = await request(expressApp)
      .get(`/api/v1/tasks?filter=categoryId:eq:${work}`)
      .set(auth(alice))

    // A join against the many-to-many emits one row per matching link. With one
    // link matching this looks fine either way; the count is where a join shows
    // up, and `total` drives the client's pagination.
    expect(titles(res)).toEqual(['both'])
    expect(res.body.data).toHaveLength(1)
    expect(res.body.meta.total).toBe(1)
  })

  it('ANDs two category filters — a task must be in both', async () => {
    const { expressApp, alice } = await twoUsers()
    const work = await newCategory(expressApp, alice, 'Work')
    const urgent = await newCategory(expressApp, alice, 'Urgent')

    await newTask(expressApp, alice, { title: 'both', categoryIds: [work, urgent] })
    await newTask(expressApp, alice, { title: 'work only', categoryIds: [work] })

    const res = await request(expressApp)
      .get(`/api/v1/tasks?filter=categoryId:eq:${work}&filter=categoryId:eq:${urgent}`)
      .set(auth(alice))

    // This is the case that separates EXISTS from a join, and the reason the
    // "counts once" test above cannot: with a single join, one link row would
    // have to equal two different category ids at once, so the honest answer
    // ('both') comes back as nothing at all.
    expect(titles(res)).toEqual(['both'])
  })

  it('combines with the other filters rather than replacing them', async () => {
    const { expressApp, alice } = await twoUsers()
    const work = await newCategory(expressApp, alice, 'Work')

    await newTask(expressApp, alice, { title: 'work high', categoryIds: [work], priority: 'high' })
    await newTask(expressApp, alice, { title: 'work low', categoryIds: [work], priority: 'low' })
    await newTask(expressApp, alice, { title: 'loose high', priority: 'high' })

    const res = await request(expressApp)
      .get(`/api/v1/tasks?filter=categoryId:eq:${work}&filter=priority:eq:high`)
      .set(auth(alice))

    // The chip row in the UI is only honest if the filters AND together.
    expect(titles(res)).toEqual(['work high'])
  })

  it("returns an empty list for another user's category id, not an error", async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const aliceWork = await newCategory(expressApp, alice, 'Work')
    await newTask(expressApp, alice, { title: 'alice task', categoryIds: [aliceWork] })
    await newTask(expressApp, bob, { title: 'bob task' })

    const res = await request(expressApp)
      .get(`/api/v1/tasks?filter=categoryId:eq:${aliceWork}`)
      .set(auth(bob))

    // 200-with-nothing, not 422. A distinct error would confirm the id exists,
    // handing back the enumeration oracle the rest of the API closes — and it
    // must not leak Alice's task either.
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('returns an empty list for a category id that exists nowhere', async () => {
    const { expressApp, alice } = await twoUsers()
    await newTask(expressApp, alice, { title: 'something' })

    const res = await request(expressApp)
      .get('/api/v1/tasks?filter=categoryId:eq:00000000-0000-0000-0000-000000000000')
      .set(auth(alice))

    // Indistinguishable from the unowned case above, which is the point.
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
})
