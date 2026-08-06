import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { Container } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { SqliteAdapter } from '../adapters/sqlite.adapter'
import { AuthModule } from '../modules/auth/auth.module'
import { notFoundProblem } from '../http/not-found'

beforeEach(() => {
  Container.reset()
})

describe('error surface', () => {
  it('emits RFC 9457 problem+json for an unmatched route', async () => {
    const { expressApp } = await createTestApp({
      modules: [AuthModule()],
      adapters: [SqliteAdapter()],
      onNotFound: notFoundProblem,
    })

    const res = await request(expressApp).get('/api/v1/no-such-route')

    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.body).toMatchObject({ status: 404 })
    expect(res.body.title).toBeTruthy()
  })

  // A handled HttpException tells us nothing about leakage — it is formatted
  // deliberately. These force an UNEXPECTED throw through the default handler.
  //
  // Verified against the framework source: `errorHandler()` captures
  // `isProduction = process.env.NODE_ENV === 'production'` at construction and
  // spreads `{ error, stack }` into the 500 body only when it is false.
  async function boomApp() {
    const { defineModule, Controller, Get } = await import('@forinda/kickjs')

    @Controller()
    class BoomController {
      @Get('/boom')
      boom() {
        throw new Error('kaboom')
      }
    }

    const BoomModule = defineModule({
      name: 'BoomModule',
      build: () => ({
        routes() {
          return { path: '/boom', controller: BoomController }
        },
      }),
    })

    return createTestApp({ modules: [BoomModule()], onNotFound: notFoundProblem })
  }

  it('redacts stack traces and filesystem paths in production', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const { expressApp } = await boomApp()
      const res = await request(expressApp).get('/api/v1/boom/boom')
      const body = JSON.stringify(res.body)

      expect(res.status).toBe(500)
      expect(body).not.toMatch(/\/home\//)
      expect(body).not.toMatch(/node_modules/)
      expect(body).not.toContain('"stack"')
      expect(body).not.toContain('kaboom')
      expect(res.body.message).toBe('Internal Server Error')
    } finally {
      process.env.NODE_ENV = previous
    }
  })

  it('DOES include the stack outside production — deliberate, and why it must never run as non-production', async () => {
    const { expressApp } = await boomApp()
    const res = await request(expressApp).get('/api/v1/boom/boom')

    expect(res.status).toBe(500)
    // Documents the dev-only behaviour so a future change that leaks in
    // production is a visible diff against a stated contract.
    expect(JSON.stringify(res.body)).toContain('"stack"')
  })
})
