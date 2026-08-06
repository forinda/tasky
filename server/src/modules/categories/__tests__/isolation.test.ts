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

/**
 * Two users on ONE app instance — the only setup that can prove isolation.
 * Separate apps would pass trivially even with every ownership predicate
 * removed, because each would have its own database.
 */
async function twoUsers() {
  const { expressApp } = await createTestApp({
    modules: [AuthModule(), CategoriesModule()],
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

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

describe('cross-user isolation', () => {
  it('Bob cannot see Alice’s categories in his list', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(alice))
      .send({ name: 'Alice Work' })

    const res = await request(expressApp).get('/api/v1/categories').set(auth(bob))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
    expect(JSON.stringify(res.body)).not.toContain('Alice Work')
  })

  it('Bob cannot update Alice’s category, and it is unchanged', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const created = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(alice))
      .send({ name: 'Alice Work' })

    const attempt = await request(expressApp)
      .put(`/api/v1/categories/${created.body.id}`)
      .set(auth(bob))
      .send({ name: 'Hijacked' })

    // 404, not 403 — a 403 would confirm the id exists.
    expect(attempt.status).toBe(404)

    const stillHers = await request(expressApp).get('/api/v1/categories').set(auth(alice))
    expect(stillHers.body.data[0].name).toBe('Alice Work')
  })

  it('Bob cannot delete Alice’s category, and it survives', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const created = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(alice))
      .send({ name: 'Alice Work' })

    expect(
      (await request(expressApp).delete(`/api/v1/categories/${created.body.id}`).set(auth(bob)))
        .status,
    ).toBe(404)

    const stillHers = await request(expressApp).get('/api/v1/categories').set(auth(alice))
    expect(stillHers.body.data).toHaveLength(1)
  })

  it('both users may hold a category with the same name', async () => {
    const { expressApp, alice, bob } = await twoUsers()

    const hers = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(alice))
      .send({ name: 'Work' })
    const his = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(bob))
      .send({ name: 'Work' })

    expect(hers.status).toBe(201)
    // A 409 here would mean the unique constraint is global, making category
    // names a shared namespace — and leaking that Alice already used one.
    expect(his.status).toBe(201)
    expect(his.body.id).not.toBe(hers.body.id)
  })

  it('a 404 for someone else’s id is indistinguishable from a 404 for a missing id', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const created = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(alice))
      .send({ name: 'Alice Work' })

    const othersId = await request(expressApp)
      .put(`/api/v1/categories/${created.body.id}`)
      .set(auth(bob))
      .send({ name: 'X' })

    const missingId = await request(expressApp)
      .put('/api/v1/categories/definitely-not-a-real-id')
      .set(auth(bob))
      .send({ name: 'X' })

    expect(othersId.status).toBe(missingId.status)
    // Matching status is not enough: if the bodies differ at all, an attacker
    // can still distinguish "exists but not yours" from "does not exist".
    expect(othersId.body).toEqual(missingId.body)
  })
})
