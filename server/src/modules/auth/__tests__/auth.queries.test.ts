import { describe, it, expect, afterEach } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '@/db/database'
import { createUser, findUserByEmail, findUserById } from '../auth.queries'

const MIGRATIONS = resolve(import.meta.dirname, '../../../db/migrations')

let open: Database | undefined

afterEach(() => {
  open?.close()
  open = undefined
})

function freshDatabase(): Database {
  const database = new Database(new ConfigService())
  // Assigned before migrate() so a migration failure still gets torn down.
  open = database
  migrate(database.db, { migrationsFolder: MIGRATIONS })
  return database
}

describe('user queries', () => {
  it('creates and finds a user by email', async () => {
    const db = freshDatabase()
    const created = await createUser(db, { email: 'a@example.com', passwordHash: 'h', name: 'A' })

    expect(created.id).toBeTruthy()
    const found = await findUserByEmail(db, 'a@example.com')
    expect(found?.id).toBe(created.id)
  })

  it('finds by id', async () => {
    const db = freshDatabase()
    const created = await createUser(db, { email: 'b@example.com', passwordHash: 'h', name: 'B' })
    expect((await findUserById(db, created.id))?.email).toBe('b@example.com')
  })

  it('returns null for a missing user rather than throwing', async () => {
    const db = freshDatabase()
    expect(await findUserByEmail(db, 'nobody@example.com')).toBeNull()
    expect(await findUserById(db, 'does-not-exist')).toBeNull()
  })

  it('rejects a duplicate email at the database level', async () => {
    const db = freshDatabase()
    await createUser(db, { email: 'dupe@example.com', passwordHash: 'h', name: 'A' })
    // Asserts the DATABASE rejects it — a uniqueness check done only in
    // application code loses a race between two concurrent signups.
    await expect(
      createUser(db, { email: 'dupe@example.com', passwordHash: 'h', name: 'B' }),
    ).rejects.toThrow(/UNIQUE/i)
  })
})
