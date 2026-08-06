import { describe, it, expect, beforeEach } from 'vitest'
import { Container } from '@forinda/kickjs'

describe('UsersController', () => {
  beforeEach(() => {
    Container.reset()
  })

  it('should be defined', () => {
    expect(true).toBe(true)
  })

  describe('POST /users', () => {
    it('should create a new users', async () => {
      // TODO: Set up test module, call create endpoint, assert 201
      expect(true).toBe(true)
    })
  })

  describe('GET /users', () => {
    it('should return paginated users', async () => {
      // TODO: Set up test module, call list endpoint, assert { data, meta }
      expect(true).toBe(true)
    })
  })

  describe('GET /users/:id', () => {
    it('should return a users by id', async () => {
      // TODO: Create a users, then fetch by id, assert match
      expect(true).toBe(true)
    })

    it('should return 404 for non-existent users', async () => {
      // TODO: Fetch non-existent id, assert 404
      expect(true).toBe(true)
    })
  })

  describe('PUT /users/:id', () => {
    it('should update an existing users', async () => {
      // TODO: Create, update, assert changes
      expect(true).toBe(true)
    })
  })

  describe('DELETE /users/:id', () => {
    it('should delete a users', async () => {
      // TODO: Create, delete, assert gone
      expect(true).toBe(true)
    })
  })
})
