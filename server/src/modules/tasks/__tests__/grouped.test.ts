import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { Container, ConfigService } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { SqliteAdapter } from '@/adapters/sqlite.adapter'
import { Database } from '@/db/database'
import { categories, tasks, users } from '@/db/schema'
import { authRateLimitStore } from '@/modules/auth/auth.controller'
import { AuthModule } from '@/modules/auth/auth.module'
import { CategoriesModule } from '@/modules/categories/categories.module'
import { TasksModule } from '../tasks.module'
import { TasksRepository } from '../tasks.repository'

beforeEach(() => {
  Container.reset()
  // One shared counter for the whole auth module: without this, a file that
  // signs up twice per test starts failing with 429s that look like bugs here.
  authRateLimitStore.resetAll()
})

// No `isolated: true` — its container is not the one adapters and routes use,
// so seeded rows would land in a database the routes never read.
async function makeApp() {
  const { expressApp } = await createTestApp({
    modules: [AuthModule(), CategoriesModule(), TasksModule()],
    adapters: [SqliteAdapter()],
  })

  const signup = async (email: string) => {
    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'hunter2hunter2', name: email })
    return res.body.accessToken as string
  }

  return { expressApp, signup }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

type App = Awaited<ReturnType<typeof makeApp>>['expressApp']

const newCategory = async (app: App, token: string, name: string) =>
  (await request(app).post('/api/v1/categories').set(auth(token)).send({ name })).body.id as string

const newTask = async (app: App, token: string, body: Record<string, unknown>) =>
  (await request(app).post('/api/v1/tasks').set(auth(token)).send(body)).body.id as string

const grouped = (app: App, token: string) =>
  request(app).get('/api/v1/tasks/grouped').set(auth(token))

interface Column {
  category: { id: string; name: string } | null
  tasks: { id: string; title: string; categoryIds: string[] }[]
}

const column = (body: Column[], name: string) =>
  body.find((c) => c.category?.name === name) as Column

const titles = (col: Column) => col.tasks.map((t) => t.title).sort()

describe('GET /tasks/grouped', () => {
  it('resolves as a literal route rather than falling through to /:id', async () => {
    const { expressApp, signup } = await makeApp()
    const token = await signup('a@example.com')

    const res = await grouped(expressApp, token)

    // Declared after '/:id' this is a 404 for the task named "grouped".
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('puts a task under its category', async () => {
    const { expressApp, signup } = await makeApp()
    const token = await signup('a@example.com')
    const work = await newCategory(expressApp, token, 'Work')
    await newTask(expressApp, token, { title: 'Ship it', categoryIds: [work] })

    const res = await grouped(expressApp, token)

    expect(titles(column(res.body, 'Work'))).toEqual(['Ship it'])
  })

  it('shows a task with TWO categories in BOTH columns', async () => {
    const { expressApp, signup } = await makeApp()
    const token = await signup('a@example.com')
    const work = await newCategory(expressApp, token, 'Work')
    const home = await newCategory(expressApp, token, 'Home')
    const id = await newTask(expressApp, token, { title: 'Both', categoryIds: [work, home] })

    const res = await grouped(expressApp, token)

    // Correct for a many-to-many board, not double-counting: the same card is
    // pinned to two columns and dropping either one loses information.
    expect(titles(column(res.body, 'Work'))).toEqual(['Both'])
    expect(titles(column(res.body, 'Home'))).toEqual(['Both'])
    expect(column(res.body, 'Work').tasks[0].id).toBe(id)
    expect([...column(res.body, 'Work').tasks[0].categoryIds].sort()).toEqual(
      [work, home].sort(),
    )
  })

  it('keeps an empty category as an empty column', async () => {
    const { expressApp, signup } = await makeApp()
    const token = await signup('a@example.com')
    await newCategory(expressApp, token, 'Empty')

    const res = await grouped(expressApp, token)

    // A column that vanishes when its last card leaves is a board you cannot
    // drag anything back onto.
    expect(column(res.body, 'Empty')).toBeDefined()
    expect(column(res.body, 'Empty').tasks).toEqual([])
  })

  it('puts an uncategorized task in the null bucket, last', async () => {
    const { expressApp, signup } = await makeApp()
    const token = await signup('a@example.com')
    const work = await newCategory(expressApp, token, 'Work')
    await newTask(expressApp, token, { title: 'Filed', categoryIds: [work] })
    await newTask(expressApp, token, { title: 'Loose' })

    const res = await grouped(expressApp, token)
    const last = res.body[res.body.length - 1] as Column

    expect(last.category).toBeNull()
    expect(titles(last)).toEqual(['Loose'])
    // Exactly one null bucket, and it is not also hiding in the middle.
    expect(res.body.filter((c: Column) => c.category === null)).toHaveLength(1)
    expect(titles(column(res.body, 'Work'))).toEqual(['Filed'])
  })

  it('shows Bob none of Alice’s tasks and none of Alice’s categories', async () => {
    const { expressApp, signup } = await makeApp()
    const alice = await signup('alice@example.com')
    const bob = await signup('bob@example.com')

    const secret = await newCategory(expressApp, alice, 'AliceCategory')
    await newTask(expressApp, alice, { title: 'AliceSecret', categoryIds: [secret] })
    await newTask(expressApp, alice, { title: 'AliceLoose' })

    const res = await grouped(expressApp, bob)

    // One app, one database — separate apps would pass this with every owner
    // predicate deleted.
    expect(res.status).toBe(200)
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('AliceSecret')
    expect(body).not.toContain('AliceLoose')
    expect(body).not.toContain('AliceCategory')
    // Bob still gets his (empty) uncategorized bucket, not an empty array.
    expect(res.body).toEqual([{ category: null, tasks: [] }])
  })
})

// ---------------------------------------------------------------------------
// Part B: the update transaction, driven at the repository level. The service
// rejects an unknown category id with a 422 long before the write, so the only
// way to make the LINK step fail is to call the repository directly.
// ---------------------------------------------------------------------------

const MIGRATIONS = resolve(import.meta.dirname, '../../../db/migrations')

let open: Database | undefined

afterEach(() => {
  open?.close()
  open = undefined
})

function freshRepo() {
  const database = new Database(new ConfigService())
  open = database
  migrate(database.db, { migrationsFolder: MIGRATIONS })

  database.db
    .insert(users)
    .values({ id: 'owner-a', email: 'a@example.com', passwordHash: 'h', name: 'A' })
    .run()
  database.db.insert(categories).values({ id: 'cat-a1', ownerId: 'owner-a', name: 'Work' }).run()

  return { repo: new TasksRepository(database), database }
}

describe('updateWithCategories', () => {
  it('rolls back the column patch when the link step fails', async () => {
    const { repo, database } = freshRepo()
    const task = repo.createWithCategories('owner-a', { title: 'Original' }, ['cat-a1'])

    // 'ghost-category' has no row, so the join insert violates the foreign key
    // AFTER the UPDATE has run. Two statements outside a transaction would
    // leave the title patched and the links half-written.
    expect(() =>
      repo.updateWithCategories(task.id, 'owner-a', { title: 'Patched' }, [
        'cat-a1',
        'ghost-category',
      ]),
    ).toThrow()

    const [row] = database.db.select().from(tasks).all()
    expect(row.title).toBe('Original')
    expect(repo.findCategoryIds(task.id)).toEqual(['cat-a1'])
  })
})
