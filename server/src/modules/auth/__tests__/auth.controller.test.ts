import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { ConfigService, Container } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { SignJWT } from 'jose'
import { SqliteAdapter } from '../../../adapters/sqlite.adapter'
import { AuthModule } from '../auth.module'

// NOTE: deliberately no `isolated: true`. createTestApp's isolated container is
// NOT the one adapters and routes use (Application takes Container.getInstance()),
// so an isolated graph would leave the routes reading a different, unmigrated
// database while seeded data went somewhere they never look.
async function appFor() {
  return createTestApp({ modules: [AuthModule()], adapters: [SqliteAdapter()] })
}

const VALID = { email: 'a@example.com', password: 'hunter2hunter2', name: 'A' }

beforeEach(() => {
  Container.reset()
})

describe('POST /api/v1/auth/signup', () => {
  it('creates a user and returns a token', async () => {
    const { expressApp } = await appFor()

    const res = await request(expressApp).post('/api/v1/auth/signup').send(VALID)

    expect(res.status).toBe(201)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.email).toBe(VALID.email)
  })

  it('never returns passwordHash', async () => {
    const { expressApp } = await appFor()

    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ ...VALID, email: 'b@example.com' })

    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
    expect(JSON.stringify(res.body)).not.toContain('scrypt$')
  })

  it('rejects a duplicate email with 409', async () => {
    const { expressApp } = await appFor()
    const body = { ...VALID, email: 'dupe@example.com' }

    await request(expressApp).post('/api/v1/auth/signup').send(body)
    const res = await request(expressApp).post('/api/v1/auth/signup').send(body)

    expect(res.status).toBe(409)
  })

  // 422, not 400: the framework maps Zod validation failures to Unprocessable
  // Entity — the request parsed fine, its contents were invalid.
  it('rejects a short password with 422', async () => {
    const { expressApp } = await appFor()

    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email: 'c@example.com', password: 'short', name: 'C' })

    expect(res.status).toBe(422)
  })

  it('rejects a malformed email with 422', async () => {
    const { expressApp } = await appFor()

    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email: 'not-an-email', password: 'hunter2hunter2', name: 'C' })

    expect(res.status).toBe(422)
  })
})

describe('POST /api/v1/auth/login', () => {
  it('returns a token for correct credentials', async () => {
    const { expressApp } = await appFor()
    await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ ...VALID, email: 'd@example.com' })

    const res = await request(expressApp)
      .post('/api/v1/auth/login')
      .send({ email: 'd@example.com', password: VALID.password })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
  })

  it('fails identically for a wrong password and an unknown email', async () => {
    const { expressApp } = await appFor()
    await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ ...VALID, email: 'e@example.com' })

    const wrongPassword = await request(expressApp)
      .post('/api/v1/auth/login')
      .send({ email: 'e@example.com', password: 'wrongwrongwrong' })

    const unknownEmail = await request(expressApp)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrongwrongwrong' })

    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    // Identical bodies — any difference is a user-enumeration oracle.
    expect(unknownEmail.body).toEqual(wrongPassword.body)
  })
})

describe('GET /api/v1/auth/me', () => {
  async function signedUp() {
    const { expressApp } = await appFor()
    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ ...VALID, email: 'me@example.com' })
    return { expressApp, token: res.body.token as string, user: res.body.user }
  }

  it('returns the current user for a valid token', async () => {
    const { expressApp, token, user } = await signedUp()

    const res = await request(expressApp)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(user.id)
    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
  })

  it('401s with no token', async () => {
    const { expressApp } = await signedUp()
    expect((await request(expressApp).get('/api/v1/auth/me')).status).toBe(401)
  })

  it('401s with a malformed header', async () => {
    const { expressApp, token } = await signedUp()
    const res = await request(expressApp).get('/api/v1/auth/me').set('Authorization', token)
    expect(res.status).toBe(401)
  })

  it('401s with a garbage token', async () => {
    const { expressApp } = await signedUp()
    const res = await request(expressApp)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.jwt')
    expect(res.status).toBe(401)
  })

  it('401s with a token signed by the wrong secret', async () => {
    const { expressApp, user } = await signedUp()
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode('a-completely-different-secret-32-chars'))

    const res = await request(expressApp)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${foreign}`)
    expect(res.status).toBe(401)
  })

  it('401s for a valid token whose user no longer exists', async () => {
    const { expressApp } = await appFor()
    const orphan = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-that-never-existed')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode(new ConfigService().get('JWT_SECRET')))

    const res = await request(expressApp)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${orphan}`)
    expect(res.status).toBe(401)
  })

  // Catches over-application: registering the contributor module-wide instead
  // of per-method would lock everyone out of signing up, and every other test
  // here would still pass.
  it('signup and login remain reachable without a token', async () => {
    const { expressApp } = await appFor()
    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ ...VALID, email: 'public@example.com' })
    expect(res.status).toBe(201)
  })
})

describe('auth hardening', () => {
  it('treats email as case-insensitive', async () => {
    const { expressApp } = await appFor()
    await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ ...VALID, email: 'Case@Example.com' })

    // Same human. Without normalisation SQLite's BINARY-collated unique index
    // would happily create a second account, and ownership hangs off users.id.
    const dupe = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ ...VALID, email: 'case@example.com' })
    expect(dupe.status).toBe(409)

    const login = await request(expressApp)
      .post('/api/v1/auth/login')
      .send({ email: 'CASE@EXAMPLE.COM', password: VALID.password })
    expect(login.status).toBe(200)
  })

  it('returns 409 rather than 500 when concurrent signups collide', async () => {
    const { expressApp } = await appFor()
    const body = { ...VALID, email: 'race@example.com' }

    // The old check-then-insert let all five past the pre-check; four hit the
    // raw driver error and surfaced as 500s carrying SQL text and a stack.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(expressApp).post('/api/v1/auth/signup').send(body),
      ),
    )

    const statuses = results.map((r) => r.status).sort()
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(4)
    expect(statuses).not.toContain(500)
    expect(JSON.stringify(results.map((r) => r.body))).not.toContain('UNIQUE constraint')
  })
})
