import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { Container } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { eq } from 'drizzle-orm'
import { SqliteAdapter } from '@/adapters/sqlite.adapter'
import { Database } from '@/db/database'
import { refreshTokens, taskCategories, users } from '@/db/schema'
import { authRateLimitStore } from '@/modules/auth/auth.controller'
import { AuthModule } from '@/modules/auth/auth.module'
import { CategoriesModule } from '@/modules/categories/categories.module'
import { TasksModule } from '../tasks.module'

beforeEach(() => {
  Container.reset()
  authRateLimitStore.resetAll()
})

// No `isolated: true` — its container is not the one adapters and routes use,
// so the Database resolved below would not be the one behind the HTTP calls
// and every join-row assertion here would read an empty, unmigrated database.
async function makeApp() {
  const { expressApp } = await createTestApp({
    modules: [AuthModule(), CategoriesModule(), TasksModule()],
    adapters: [SqliteAdapter()],
  })

  const signup = await request(expressApp)
    .post('/api/v1/auth/signup')
    .send({ email: 'a@example.com', password: 'hunter2hunter2', name: 'A' })

  return {
    expressApp,
    db: Container.getInstance().resolve(Database).db,
    token: signup.body.token as string,
    ownerId: signup.body.user.id as string,
  }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

type App = Awaited<ReturnType<typeof makeApp>>['expressApp']

const newCategory = async (app: App, token: string, name: string) =>
  (await request(app).post('/api/v1/categories').set(auth(token)).send({ name })).body.id as string

const newTask = async (app: App, token: string, body: Record<string, unknown>) =>
  (await request(app).post('/api/v1/tasks').set(auth(token)).send(body)).body.id as string

describe('DELETE /categories/:id', () => {
  it('keeps the tasks and drops only the links', async () => {
    const { expressApp, db, token } = await makeApp()
    const work = await newCategory(expressApp, token, 'Work')
    const home = await newCategory(expressApp, token, 'Home')
    const id = await newTask(expressApp, token, { title: 'Survivor', categoryIds: [work, home] })

    expect((await request(expressApp).delete(`/api/v1/categories/${work}`).set(auth(token))).status)
      .toBe(204)

    // The task is the thing with independent value. Losing a label must never
    // lose the work.
    const res = await request(expressApp).get(`/api/v1/tasks/${id}`).set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Survivor')
    expect(res.body.categoryIds).toEqual([home])

    // ON DELETE cascade on task_categories.category_id, checked at the row
    // level: an inner join would hide a dangling link either way.
    expect(db.select().from(taskCategories).where(eq(taskCategories.categoryId, work)).all())
      .toEqual([])
    expect(db.select().from(taskCategories).where(eq(taskCategories.categoryId, home)).all())
      .toHaveLength(1)
  })
})

describe('DELETE /tasks/:id', () => {
  it('drops its links and leaves every category standing', async () => {
    const { expressApp, db, token } = await makeApp()
    const work = await newCategory(expressApp, token, 'Work')
    const home = await newCategory(expressApp, token, 'Home')
    const id = await newTask(expressApp, token, { title: 'Doomed', categoryIds: [work, home] })

    expect((await request(expressApp).delete(`/api/v1/tasks/${id}`).set(auth(token))).status)
      .toBe(204)

    expect(db.select().from(taskCategories).where(eq(taskCategories.taskId, id)).all()).toEqual([])

    const cats = await request(expressApp).get('/api/v1/categories').set(auth(token))
    expect(cats.body.data.map((c: { name: string }) => c.name).sort()).toEqual(['Home', 'Work'])

    // The emptied category is still browsable, not a 404.
    const browse = await request(expressApp).get(`/api/v1/categories/${work}/tasks`).set(auth(token))
    expect(browse.status).toBe(200)
    expect(browse.body.data).toEqual([])
  })
})

describe('deleting a user', () => {
  // There is no user-delete endpoint, so this runs against the same Database
  // the routes use — a `UsersRepository.remove` would emit exactly this
  // statement. When such an endpoint is added it MUST delete the user's tasks
  // and categories first (in that order — tasks own the join rows), because
  // both foreign keys are ON DELETE restrict and the bare delete below throws.
  it('fails while they still own tasks or categories', async () => {
    const { expressApp, db, token, ownerId } = await makeApp()
    const work = await newCategory(expressApp, token, 'Work')
    const id = await newTask(expressApp, token, { title: 'Blocker', categoryIds: [work] })

    const deleteUser = () => db.delete(users).where(eq(users.id, ownerId)).run()

    // Blocked by tasks.owner_id.
    expect(deleteUser).toThrow(/FOREIGN KEY constraint failed/)
    expect(db.select().from(users).where(eq(users.id, ownerId)).all()).toHaveLength(1)

    await request(expressApp).delete(`/api/v1/tasks/${id}`).set(auth(token))
    // Still blocked, now by categories.owner_id — clearing tasks alone is not
    // enough, which is the half-done cleanup an endpoint would ship with.
    expect(deleteUser).toThrow(/FOREIGN KEY constraint failed/)

    await request(expressApp).delete(`/api/v1/categories/${work}`).set(auth(token))
    expect(deleteUser).not.toThrow()
    expect(db.select().from(users).all()).toEqual([])
  })

  // The other direction of the same rule. tasks.owner_id and categories.owner_id
  // are RESTRICT because a user's work has value worth refusing to destroy;
  // refresh_tokens.user_id is CASCADE because a token has no meaning without
  // the user it authenticates. If this ever flips to RESTRICT, deleting a user
  // becomes impossible until someone remembers a table they have never heard of.
  it('takes their refresh tokens with them', async () => {
    const { db, ownerId } = await makeApp()

    db.insert(refreshTokens)
      .values({
        userId: ownerId,
        familyId: 'fam-1',
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 60_000),
      })
      .run()
    expect(db.select().from(refreshTokens).all()).toHaveLength(1)

    db.delete(users).where(eq(users.id, ownerId)).run()

    expect(db.select().from(refreshTokens).all()).toEqual([])
  })
})
