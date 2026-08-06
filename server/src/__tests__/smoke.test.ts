import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createTestApp } from '@forinda/kickjs-testing'

describe('application bootstrap', () => {
  it('boots with no modules registered', async () => {
    const { expressApp, container } = await createTestApp({
      modules: [],
      isolated: true,
    })

    expect(expressApp).toBeDefined()
    expect(container).toBeDefined()
  })

  it('returns 404 for an unknown route', async () => {
    const { expressApp } = await createTestApp({
      modules: [],
      isolated: true,
    })

    const res = await request(expressApp).get('/api/v1/nope')

    expect(res.status).toBe(404)
  })
})
