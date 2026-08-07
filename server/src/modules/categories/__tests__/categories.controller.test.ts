import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { Container } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { SqliteAdapter } from '@/adapters/sqlite.adapter'
import { AuthModule } from '@/modules/auth/auth.module'
import { CategoriesModule } from '../categories.module'

beforeEach(() => {
  Container.reset()
})

// No `isolated: true` — createTestApp's isolated container is NOT the one
// adapters and routes use, so seeded data would land in a database the routes
// never read.
async function appWithUser(email = 'a@example.com') {
  const app = await createTestApp({
    modules: [AuthModule(), CategoriesModule()],
    adapters: [SqliteAdapter()],
  })
  const res = await request(app.expressApp)
    .post('/api/v1/auth/signup')
    .send({ email, password: 'hunter2hunter2', name: 'A' })
  return { expressApp: app.expressApp, token: res.body.token as string }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

describe('categories CRUD', () => {
  it('creates a category', async () => {
    const { expressApp, token } = await appWithUser()
    const res = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work', color: '#4F46E5' })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Work')
    // ownerId is internal; echoing it would tell the client about a dimension
    // it has no business reasoning over.
    expect(res.body.ownerId).toBeUndefined()
  })

  it('rejects a duplicate name for the same user with 409', async () => {
    const { expressApp, token } = await appWithUser()
    await request(expressApp).post('/api/v1/categories').set(auth(token)).send({ name: 'Work' })
    const res = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work' })

    expect(res.status).toBe(409)
  })

  it('rejects a non-hex colour with 422', async () => {
    const { expressApp, token } = await appWithUser()
    const res = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work', color: 'red' })

    expect(res.status).toBe(422)
  })

  it('rejects an empty update patch with 422', async () => {
    const { expressApp, token } = await appWithUser()
    const created = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work' })

    const res = await request(expressApp)
      .put(`/api/v1/categories/${created.body.id}`)
      .set(auth(token))
      .send({})

    expect(res.status).toBe(422)
  })

  it('updates and deletes', async () => {
    const { expressApp, token } = await appWithUser()
    const created = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work' })

    const updated = await request(expressApp)
      .put(`/api/v1/categories/${created.body.id}`)
      .set(auth(token))
      .send({ name: 'Renamed' })
    expect(updated.status).toBe(200)
    expect(updated.body.name).toBe('Renamed')

    const deleted = await request(expressApp)
      .delete(`/api/v1/categories/${created.body.id}`)
      .set(auth(token))
    expect(deleted.status).toBe(204)
  })

  it('404s on updating a category that does not exist', async () => {
    const { expressApp, token } = await appWithUser()
    const res = await request(expressApp)
      .put('/api/v1/categories/no-such-id')
      .set(auth(token))
      .send({ name: 'X' })

    expect(res.status).toBe(404)
  })

  it('returns a paginated envelope', async () => {
    const { expressApp, token } = await appWithUser()
    for (const name of ['a', 'b', 'c']) {
      await request(expressApp).post('/api/v1/categories').set(auth(token)).send({ name })
    }

    const res = await request(expressApp).get('/api/v1/categories?limit=2').set(auth(token))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })

  it('401s on every route without a token', async () => {
    const { expressApp } = await appWithUser()

    // Proves the module-level contributor covers all four routes. Per-method
    // registration would let exactly one slip through unnoticed.
    expect((await request(expressApp).get('/api/v1/categories')).status).toBe(401)
    expect(
      (await request(expressApp).post('/api/v1/categories').send({ name: 'X' })).status,
    ).toBe(401)
    expect(
      (await request(expressApp).put('/api/v1/categories/x').send({ name: 'X' })).status,
    ).toBe(401)
    expect((await request(expressApp).delete('/api/v1/categories/x')).status).toBe(401)
  })
})
