import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { Container } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { eq } from 'drizzle-orm'
import { decodeJwt } from 'jose'
import { SqliteAdapter } from '@/adapters/sqlite.adapter'
import { Database } from '@/db/database'
import { refreshTokens, type RefreshToken } from '@/db/schema'
import { authRateLimitStore } from '../auth.controller'
import { AuthModule } from '../auth.module'
import { REFRESH_COOKIE } from '../cookies'

beforeEach(() => {
  Container.reset()
  authRateLimitStore.resetAll()
})

async function makeApp() {
  const { expressApp } = await createTestApp({
    modules: [AuthModule()],
    adapters: [SqliteAdapter()],
  })
  return { expressApp, db: Container.getInstance().resolve(Database).db }
}

type App = Awaited<ReturnType<typeof makeApp>>['expressApp']

const CREDENTIALS = { email: 'a@example.com', password: 'hunter2hunter2', name: 'A' }

/** Pulls the refresh cookie's value out of a Set-Cookie header. */
function refreshCookieFrom(res: { headers: Record<string, unknown> }): string | undefined {
  const raw = res.headers['set-cookie'] as string[] | undefined
  const header = raw?.find((c) => c.startsWith(`${REFRESH_COOKIE}=`))
  return header?.split(';')[0]?.split('=')[1]
}

function setCookieHeaderFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'] as string[] | undefined
  return raw?.find((c) => c.startsWith(`${REFRESH_COOKIE}=`)) ?? ''
}

async function signup(app: App) {
  const res = await request(app).post('/api/v1/auth/signup').send(CREDENTIALS)
  return { res, cookie: refreshCookieFrom(res) }
}

const withCookie = (value: string) => ({ Cookie: `${REFRESH_COOKIE}=${value}` })

describe('the refresh cookie', () => {
  it('is httpOnly, sameSite=strict, and scoped to the auth path', async () => {
    const { expressApp } = await makeApp()
    const { res } = await signup(expressApp)

    const header = setCookieHeaderFrom(res)
    expect(header).toMatch(/HttpOnly/i)
    expect(header).toMatch(/SameSite=Strict/i)
    expect(header).toMatch(/Path=\/api\/v1\/auth/i)
  })

  it('is not Secure under test, so local http still works', async () => {
    // The flag is driven by NODE_ENV. A `Secure` cookie is silently dropped
    // over plain http, which is why it cannot be set unconditionally.
    const { expressApp } = await makeApp()
    const { res } = await signup(expressApp)
    expect(setCookieHeaderFrom(res)).not.toMatch(/;\s*Secure/i)
  })

  it('never appears in a response body', async () => {
    const { expressApp } = await makeApp()
    const { res, cookie } = await signup(expressApp)

    expect(cookie).toBeTruthy()
    // The whole design fails if the refresh token is readable by script.
    expect(JSON.stringify(res.body)).not.toContain(cookie)
    expect(res.body.refreshToken).toBeUndefined()
  })

  it('is stored only as a hash', async () => {
    const { expressApp, db } = await makeApp()
    const { cookie } = await signup(expressApp)

    const rows = db.select().from(refreshTokens).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenHash).not.toBe(cookie)
    expect(rows[0].tokenHash).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('the access token', () => {
  it('expires in minutes, not days', async () => {
    const { expressApp } = await makeApp()
    const { res } = await signup(expressApp)

    const { exp, iat } = decodeJwt(res.body.accessToken)
    const lifetimeSeconds = (exp ?? 0) - (iat ?? 0)

    // 15m by default. The assertion is an upper bound rather than an equality
    // so a deployment may shorten it, never lengthen it back to the old 7d.
    expect(lifetimeSeconds).toBeLessThanOrEqual(60 * 60)
    expect(lifetimeSeconds).toBeGreaterThan(0)
  })
})

describe('POST /auth/refresh', () => {
  it('rotates: the old cookie stops working and a new one takes over', async () => {
    const { expressApp, db } = await makeApp()
    const { cookie } = await signup(expressApp)

    const rotated = await request(expressApp).post('/api/v1/auth/refresh').set(withCookie(cookie!))
    expect(rotated.status).toBe(200)

    const next = refreshCookieFrom(rotated)
    expect(next).toBeTruthy()
    expect(next).not.toBe(cookie)
    expect(rotated.body.accessToken).toBeTruthy()

    // The superseded row records what replaced it.
    const rows = db.select().from(refreshTokens).all()
    expect(rows).toHaveLength(2)
    const old = rows.find((r: RefreshToken) => r.revokedAt !== null)!
    expect(old.replacedById).toBe(rows.find((r: RefreshToken) => r.revokedAt === null)!.id)
  })

  it('rejects a token that was already rotated, and kills the whole family', async () => {
    const { expressApp, db } = await makeApp()
    const { cookie } = await signup(expressApp)

    const rotated = await request(expressApp).post('/api/v1/auth/refresh').set(withCookie(cookie!))
    const live = refreshCookieFrom(rotated)!

    // Replaying the spent token: either a replay or a stolen cookie in use
    // beside the real one. Indistinguishable, and answered the same way.
    const replay = await request(expressApp).post('/api/v1/auth/refresh').set(withCookie(cookie!))
    expect(replay.status).toBe(401)

    // The honest user is logged out too. That is the intended blast radius —
    // the alternative leaves the attacker holding a working session.
    const afterBreach = await request(expressApp).post('/api/v1/auth/refresh').set(withCookie(live))
    expect(afterBreach.status).toBe(401)

    expect(db.select().from(refreshTokens).all().every((r: RefreshToken) => r.revokedAt !== null)).toBe(true)
  })

  it('rejects an expired token', async () => {
    const { expressApp, db } = await makeApp()
    const { cookie } = await signup(expressApp)

    db.update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .run()

    const res = await request(expressApp).post('/api/v1/auth/refresh').set(withCookie(cookie!))
    expect(res.status).toBe(401)
  })

  it('rejects an unknown token', async () => {
    const { expressApp } = await makeApp()
    await signup(expressApp)

    const res = await request(expressApp)
      .post('/api/v1/auth/refresh')
      .set(withCookie('not-a-real-token'))
    expect(res.status).toBe(401)
  })

  it('rejects a request with no cookie at all', async () => {
    const { expressApp } = await makeApp()
    expect((await request(expressApp).post('/api/v1/auth/refresh')).status).toBe(401)
  })

  it('rejects a cross-origin request', async () => {
    const { expressApp } = await makeApp()
    const { cookie } = await signup(expressApp)

    const res = await request(expressApp)
      .post('/api/v1/auth/refresh')
      .set(withCookie(cookie!))
      .set('Origin', 'https://evil.example')

    // SameSite=Strict is the real defence and supertest cannot exercise it;
    // this is the second lock, and it is the one a test can reach.
    expect(res.status).toBe(403)
  })

  it('allows a same-origin request', async () => {
    const { expressApp } = await makeApp()
    const { cookie } = await signup(expressApp)

    // Host and Origin set together and matching — the shape a browser sends
    // for a same-origin fetch. Without this case the rejection test above
    // would pass even if the check rejected everything.
    const res = await request(expressApp)
      .post('/api/v1/auth/refresh')
      .set(withCookie(cookie!))
      .set('Host', 'tasky.test')
      .set('Origin', 'https://tasky.test')

    expect(res.status).toBe(200)
  })
})

describe('POST /auth/logout', () => {
  it('revokes the family and clears the cookie', async () => {
    const { expressApp, db } = await makeApp()
    const { cookie } = await signup(expressApp)

    const res = await request(expressApp).post('/api/v1/auth/logout').set(withCookie(cookie!))
    expect(res.status).toBe(204)

    // Cleared with matching attributes, or the browser keeps the original.
    const header = setCookieHeaderFrom(res)
    expect(header).toMatch(/Path=\/api\/v1\/auth/i)

    expect(db.select().from(refreshTokens).all().every((r: RefreshToken) => r.revokedAt !== null)).toBe(true)

    // And the cookie cannot be replayed afterwards.
    const replay = await request(expressApp).post('/api/v1/auth/refresh').set(withCookie(cookie!))
    expect(replay.status).toBe(401)
  })

  it('is idempotent without a cookie', async () => {
    const { expressApp } = await makeApp()
    expect((await request(expressApp).post('/api/v1/auth/logout')).status).toBe(204)
  })
})

describe('signing in twice', () => {
  it('gives each session its own family, so one logout leaves the other alone', async () => {
    const { expressApp } = await makeApp()
    await signup(expressApp)

    const phone = await request(expressApp)
      .post('/api/v1/auth/login')
      .send({ email: CREDENTIALS.email, password: CREDENTIALS.password })
    const desktop = await request(expressApp)
      .post('/api/v1/auth/login')
      .send({ email: CREDENTIALS.email, password: CREDENTIALS.password })

    await request(expressApp)
      .post('/api/v1/auth/logout')
      .set(withCookie(refreshCookieFrom(phone)!))

    const stillWorks = await request(expressApp)
      .post('/api/v1/auth/refresh')
      .set(withCookie(refreshCookieFrom(desktop)!))

    expect(stillWorks.status).toBe(200)
  })
})
