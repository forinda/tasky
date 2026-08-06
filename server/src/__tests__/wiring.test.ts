import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../index'

/**
 * Exercises the REAL exported app — the one `kick start` serves — rather than a
 * hand-built `createTestApp` graph.
 *
 * Every other HTTP test constructs its own module list, which duplicates the
 * production wiring instead of testing it. Mutation-proven: emptying
 * `src/modules/index.ts` so the deployed API has no auth routes at all left the
 * whole suite green, as did deleting `onNotFound` from `src/index.ts`. Story 4
 * and 5 mount into that same barrel, so a forgotten `.mount()` would ship
 * silently without these.
 */
describe('production wiring', () => {
  it('serves the auth routes that src/modules/index.ts mounts', async () => {
    const res = await request(app.getExpressApp())
      .post('/api/v1/auth/signup')
      .send({ email: 'wiring@example.com', password: 'hunter2hunter2', name: 'W' })

    expect(res.status).toBe(201)
    expect(res.body.token).toBeTruthy()
  })

  it('uses the onNotFound handler bootstrap() was given', async () => {
    const res = await request(app.getExpressApp()).get('/api/v1/definitely-not-a-route')

    expect(res.status).toBe(404)
    // The framework default would be application/json with {"message":"Not Found"}.
    expect(res.headers['content-type']).toContain('application/problem+json')
  })
})
