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
  // The auth limiter is one counter shared by the whole module, so a file that
  // signs up in every test trips it around test six without this.
  authRateLimitStore.resetAll()
})

// No `isolated: true` — createTestApp's isolated container is NOT the one
// adapters and routes use, so seeded data would land in a database the routes
// never read.
async function makeApp() {
  const app = await createTestApp({
    modules: [AuthModule(), CategoriesModule(), TasksModule()],
    adapters: [SqliteAdapter()],
  })

  const signup = async (email: string) => {
    const res = await request(app.expressApp)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'hunter2hunter2', name: 'A' })
    return res.body.token as string
  }

  return { expressApp: app.expressApp, signup }
}

async function appWithUser(email = 'a@example.com') {
  const { expressApp, signup } = await makeApp()
  return { expressApp, signup, token: await signup(email) }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

type App = Awaited<ReturnType<typeof makeApp>>['expressApp']

const newCategory = async (app: App, token: string, name: string) =>
  (await request(app).post('/api/v1/categories').set(auth(token)).send({ name })).body.id as string

const newTask = (app: App, token: string, body: Record<string, unknown>) =>
  request(app).post('/api/v1/tasks').set(auth(token)).send(body)

const listTasks = (app: App, token: string, query = '') =>
  request(app).get(`/api/v1/tasks${query}`).set(auth(token))

describe('tasks CRUD', () => {
  it('creates a task without categoryIds', async () => {
    const { expressApp, token } = await appWithUser()

    const res = await newTask(expressApp, token, { title: 'Write tests' })

    expect(res.status).toBe(201)
    expect(res.body.title).toBe('Write tests')
    expect(res.body.priority).toBe('medium')
    expect(res.body.status).toBe('todo')
    expect(res.body.categoryIds).toEqual([])
    // ownerId is internal; echoing it would tell the client about a dimension
    // it has no business reasoning over.
    expect(res.body.ownerId).toBeUndefined()
  })

  it('creates a task with categoryIds and echoes them back', async () => {
    const { expressApp, token } = await appWithUser()
    const work = await newCategory(expressApp, token, 'Work')
    const home = await newCategory(expressApp, token, 'Home')

    const res = await newTask(expressApp, token, {
      title: 'Linked',
      description: 'has two categories',
      priority: 'high',
      categoryIds: [work, home],
    })

    expect(res.status).toBe(201)
    expect([...res.body.categoryIds].sort()).toEqual([work, home].sort())
    expect(res.body.ownerId).toBeUndefined()

    // Round-trips through the DB, not just the create response.
    const fetched = await request(expressApp).get(`/api/v1/tasks/${res.body.id}`).set(auth(token))
    expect(fetched.status).toBe(200)
    expect([...fetched.body.categoryIds].sort()).toEqual([work, home].sort())
  })

  it('updates and deletes', async () => {
    const { expressApp, token } = await appWithUser()
    const created = await newTask(expressApp, token, { title: 'Draft' })

    const updated = await request(expressApp)
      .put(`/api/v1/tasks/${created.body.id}`)
      .set(auth(token))
      .send({ title: 'Final', status: 'done' })
    expect(updated.status).toBe(200)
    expect(updated.body.title).toBe('Final')
    expect(updated.body.status).toBe('done')

    const deleted = await request(expressApp)
      .delete(`/api/v1/tasks/${created.body.id}`)
      .set(auth(token))
    expect(deleted.status).toBe(204)

    expect(
      (await request(expressApp).get(`/api/v1/tasks/${created.body.id}`).set(auth(token))).status,
    ).toBe(404)
  })
})

describe('category ownership on write', () => {
  it('rejects an unknown category id with 422 and creates no task', async () => {
    const { expressApp, token } = await appWithUser()

    const res = await newTask(expressApp, token, {
      title: 'Should not exist',
      categoryIds: ['no-such-category'],
    })

    expect(res.status).toBe(422)

    // The check runs before the insert, so nothing half-applied.
    const list = await listTasks(expressApp, token)
    expect(list.body.data).toHaveLength(0)
  })

  it("rejects another user's category id with a body identical to the unknown-id case", async () => {
    const { expressApp, signup, token } = await appWithUser()
    const otherToken = await signup('b@example.com')
    const othersCategory = await newCategory(expressApp, otherToken, 'Theirs')

    const stolen = await newTask(expressApp, token, {
      title: 'Borrowed',
      categoryIds: [othersCategory],
    })
    const missing = await newTask(expressApp, token, {
      title: 'Borrowed',
      categoryIds: ['definitely-not-a-real-id'],
    })

    expect(stolen.status).toBe(422)
    expect(missing.status).toBe(422)
    // Identical bodies modulo the id echoed back — a different message would be
    // an oracle for probing other users' category ids one 422 at a time.
    const scrub = (body: Record<string, unknown>, id: string) =>
      JSON.parse(JSON.stringify(body).replaceAll(id, 'ID'))
    expect(scrub(stolen.body, othersCategory)).toEqual(
      scrub(missing.body, 'definitely-not-a-real-id'),
    )

    expect((await listTasks(expressApp, token)).body.data).toHaveLength(0)
  })

  it('replaces the category set wholesale on update, not merging', async () => {
    const { expressApp, token } = await appWithUser()
    const a = await newCategory(expressApp, token, 'A')
    const b = await newCategory(expressApp, token, 'B')
    const c = await newCategory(expressApp, token, 'C')

    const created = await newTask(expressApp, token, { title: 'T', categoryIds: [a, b] })

    const updated = await request(expressApp)
      .put(`/api/v1/tasks/${created.body.id}`)
      .set(auth(token))
      .send({ categoryIds: [c] })

    expect(updated.status).toBe(200)
    expect(updated.body.categoryIds).toEqual([c])

    const fetched = await request(expressApp)
      .get(`/api/v1/tasks/${created.body.id}`)
      .set(auth(token))
    expect(fetched.body.categoryIds).toEqual([c])
  })

  it('clears the set when categoryIds is []', async () => {
    const { expressApp, token } = await appWithUser()
    const a = await newCategory(expressApp, token, 'A')
    const created = await newTask(expressApp, token, { title: 'T', categoryIds: [a] })

    const updated = await request(expressApp)
      .put(`/api/v1/tasks/${created.body.id}`)
      .set(auth(token))
      .send({ categoryIds: [] })

    expect(updated.status).toBe(200)
    expect(updated.body.categoryIds).toEqual([])
  })
})

describe('list query', () => {
  async function seeded() {
    const { expressApp, token } = await appWithUser()
    await newTask(expressApp, token, { title: 'alpha', priority: 'low', status: 'todo' })
    await newTask(expressApp, token, {
      title: 'beta',
      description: 'needle in the description',
      priority: 'high',
      status: 'in_progress',
    })
    await newTask(expressApp, token, { title: 'gamma needle', priority: 'medium', status: 'todo' })
    return { expressApp, token }
  }

  it('filters by status', async () => {
    const { expressApp, token } = await seeded()

    const res = await listTasks(expressApp, token, '?filter=status:eq:todo')

    expect(res.status).toBe(200)
    expect(res.body.data.map((t: { title: string }) => t.title).sort()).toEqual([
      'alpha',
      'gamma needle',
    ])
  })

  it('filters by priority', async () => {
    const { expressApp, token } = await seeded()

    const res = await listTasks(expressApp, token, '?filter=priority:eq:high')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].title).toBe('beta')
  })

  it('narrows when filters are combined', async () => {
    const { expressApp, token } = await seeded()

    const both = await listTasks(
      expressApp,
      token,
      '?filter=status:eq:todo&filter=priority:eq:medium',
    )

    // AND, not OR: status:todo alone matches two, priority:medium alone matches
    // one, and the intersection is exactly gamma.
    expect(both.status).toBe(200)
    expect(both.body.data).toHaveLength(1)
    expect(both.body.data[0].title).toBe('gamma needle')

    const impossible = await listTasks(
      expressApp,
      token,
      '?filter=status:eq:done&filter=priority:eq:high',
    )
    expect(impossible.body.data).toHaveLength(0)
  })

  it('rejects an out-of-enum filter VALUE with 422', async () => {
    const { expressApp, token } = await seeded()

    const res = await listTasks(expressApp, token, '?filter=status:eq:banana')

    // Not an empty 200: "no results" and "your filter is nonsense" look the
    // same to a client, and only one of them is worth fixing.
    expect(res.status).toBe(422)
  })

  it('silently ignores an unknown filter FIELD', async () => {
    const { expressApp, token } = await seeded()

    const res = await listTasks(expressApp, token, '?filter=bogus:eq:banana')

    // Observed behaviour, not a preference: kickjs' parseFilters drops any
    // field outside TASK_QUERY_CONFIG.filterable before the service sees it, so
    // the request degrades to an unfiltered list rather than erroring.
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(3)
  })

  it('sorts by priority semantically, not alphabetically', async () => {
    const { expressApp, token } = await seeded()

    const res = await listTasks(expressApp, token, '?sort=priority:asc')

    expect(res.status).toBe(200)
    // Alphabetical would be high, low, medium — plausible and wrong.
    expect(res.body.data.map((t: { priority: string }) => t.priority)).toEqual([
      'high',
      'medium',
      'low',
    ])
  })

  it('searches description as well as title', async () => {
    const { expressApp, token } = await seeded()

    const res = await listTasks(expressApp, token, '?q=needle')

    expect(res.status).toBe(200)
    // beta matches on description only, gamma on title only.
    expect(res.body.data.map((t: { title: string }) => t.title).sort()).toEqual([
      'beta',
      'gamma needle',
    ])
  })
})

describe('auth', () => {
  it('401s on every route without a token', async () => {
    const { expressApp } = await makeApp()

    // Proves the module-level contributor covers all five routes. Per-method
    // registration would let exactly one slip through unnoticed.
    expect((await request(expressApp).get('/api/v1/tasks')).status).toBe(401)
    expect((await request(expressApp).get('/api/v1/tasks/x')).status).toBe(401)
    expect((await request(expressApp).post('/api/v1/tasks').send({ title: 'X' })).status).toBe(401)
    expect((await request(expressApp).put('/api/v1/tasks/x').send({ title: 'X' })).status).toBe(401)
    expect((await request(expressApp).delete('/api/v1/tasks/x')).status).toBe(401)
  })

  it("404s on another user's task with the same body as a missing id", async () => {
    const { expressApp, signup, token } = await appWithUser()
    const otherToken = await signup('b@example.com')
    const theirs = await newTask(expressApp, otherToken, { title: 'Private' })

    const foreign = await request(expressApp)
      .get(`/api/v1/tasks/${theirs.body.id}`)
      .set(auth(token))
    const missing = await request(expressApp).get('/api/v1/tasks/no-such-id').set(auth(token))

    expect(foreign.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(foreign.body.detail).toBe(missing.body.detail)
  })
})

describe('regressions found by adversarial audit', () => {
  it('accepts duplicate categoryIds without a 500, deduping them', async () => {
    const { expressApp, token } = await appWithUser()
    const cat = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work' })

    // The join table's composite PK rejects a repeated pair. Ownership
    // validation cannot catch it — the owned set is DISTINCT, so a duplicate
    // never looks rejected — so it used to escape as a 500.
    const res = await request(expressApp)
      .post('/api/v1/tasks')
      .set(auth(token))
      .send({ title: 'dup', categoryIds: [cat.body.id, cat.body.id] })

    expect(res.status).toBe(201)
    expect(res.body.categoryIds).toEqual([cat.body.id])
  })

  it('does not half-apply a PUT when categoryIds repeat', async () => {
    const { expressApp, token } = await appWithUser()
    const cat = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work' })
    const created = await request(expressApp)
      .post('/api/v1/tasks')
      .set(auth(token))
      .send({ title: 'original' })

    const res = await request(expressApp)
      .put(`/api/v1/tasks/${created.body.id}`)
      .set(auth(token))
      .send({ title: 'PATCHED', categoryIds: [cat.body.id, cat.body.id] })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('PATCHED')
    expect(res.body.categoryIds).toEqual([cat.body.id])
  })

  it('rejects a non-eq filter operator rather than silently inverting it', async () => {
    const { expressApp, token } = await appWithUser()
    await request(expressApp)
      .post('/api/v1/tasks')
      .set(auth(token))
      .send({ title: 'todo one', status: 'todo' })
    await request(expressApp)
      .post('/api/v1/tasks')
      .set(auth(token))
      .send({ title: 'done one', status: 'done' })

    // The repository only implements `eq`. Treating `neq` as `eq` returned the
    // exact INVERSE of the request — a wrong answer the client cannot detect.
    const res = await request(expressApp)
      .get('/api/v1/tasks?filter=status:neq:done')
      .set(auth(token))

    expect(res.status).toBe(422)
  })

  it('rejects a whitespace-only title', async () => {
    const { expressApp, token } = await appWithUser()
    const res = await request(expressApp)
      .post('/api/v1/tasks')
      .set(auth(token))
      .send({ title: '   ' })

    expect(res.status).toBe(422)
  })

  it('bumps updatedAt for a categoryIds-only patch', async () => {
    const { expressApp, token } = await appWithUser()
    const cat = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work' })
    const created = await request(expressApp)
      .post('/api/v1/tasks')
      .set(auth(token))
      .send({ title: 'original' })

    await new Promise((r) => setTimeout(r, 20))

    const res = await request(expressApp)
      .put(`/api/v1/tasks/${created.body.id}`)
      .set(auth(token))
      .send({ categoryIds: [cat.body.id] })

    expect(res.status).toBe(200)
    // A change the client can see must move updatedAt, or polling and caching
    // silently miss it.
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
      new Date(created.body.updatedAt).getTime(),
    )
  })
})
