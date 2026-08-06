import { describe, it, expect, afterEach } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '../../../db/database'
import { UsersRepository } from '../users.repository'

const MIGRATIONS = resolve(import.meta.dirname, '../../../db/migrations')

let open: Database | undefined

afterEach(() => {
  open?.close()
  open = undefined
})

function freshRepo(): UsersRepository {
  const database = new Database(new ConfigService())
  // Assigned before migrate() so a migration failure still gets torn down.
  open = database
  migrate(database.db, { migrationsFolder: MIGRATIONS })
  return new UsersRepository(database)
}

describe('UsersRepository', () => {
  it('creates and finds a user by email', async () => {
    const repo = freshRepo()
    const created = await repo.create({ email: 'a@example.com', passwordHash: 'h', name: 'A' })

    expect(created.id).toBeTruthy()
    const found = await repo.findByEmail('a@example.com')
    expect(found?.id).toBe(created.id)
  })

  it('finds by id', async () => {
    const repo = freshRepo()
    const created = await repo.create({ email: 'b@example.com', passwordHash: 'h', name: 'B' })
    expect((await repo.findById(created.id))?.email).toBe('b@example.com')
  })

  it('returns null for a missing user rather than throwing', async () => {
    const repo = freshRepo()
    expect(await repo.findByEmail('nobody@example.com')).toBeNull()
    expect(await repo.findById('does-not-exist')).toBeNull()
  })

  it('rejects a duplicate email at the database level', async () => {
    const repo = freshRepo()
    await repo.create({ email: 'dupe@example.com', passwordHash: 'h', name: 'A' })
    // Asserts the DATABASE rejects it — a uniqueness check done only in
    // application code loses a race between two concurrent signups.
    await expect(
      repo.create({ email: 'dupe@example.com', passwordHash: 'h', name: 'B' }),
    ).rejects.toThrow(/UNIQUE/i)
  })
})
