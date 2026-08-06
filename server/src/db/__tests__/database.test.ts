import { describe, it, expect, afterEach } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { resolve, join } from 'node:path'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { ConfigService } from '@forinda/kickjs'
import { Database } from '../database'
import { users, tasks, categories, taskCategories } from '../schema'

const MIGRATIONS = resolve(import.meta.dirname, '../migrations')

let open: Database | undefined

afterEach(() => {
  open?.close()
  open = undefined
})

function freshDb(): Database {
  const database = new Database(new ConfigService())
  // Assign before migrate() so a migration failure still gets torn down —
  // the connection is already open by this point.
  open = database
  migrate(database.db, { migrationsFolder: MIGRATIONS })
  return database
}

describe('Database', () => {
  it('enables foreign key enforcement', () => {
    const database = freshDb()

    const [{ foreign_keys: fk }] = database.connection
      .prepare('PRAGMA foreign_keys')
      .all() as Array<{ foreign_keys: number }>

    expect(fk).toBe(1)
  })

  it('refuses to delete a user who still owns tasks', () => {
    const database = freshDb()

    database.db.insert(users).values({
      id: 'u1',
      email: 'a@example.com',
      passwordHash: 'x',
      name: 'A',
    }).run()

    database.db.insert(tasks).values({ id: 't1', ownerId: 'u1', title: 'Ship' }).run()

    // ON DELETE restrict — a user's tasks have real value, so removing the
    // owner must fail loudly rather than silently destroying them.
    expect(() => database.db.delete(users).where(eq(users.id, 'u1')).run()).toThrow(
      /FOREIGN KEY/i,
    )

    expect(database.db.select().from(tasks).all()).toHaveLength(1)
  })

  it('cascades join rows when a task is deleted', () => {
    const database = freshDb()

    database.db.insert(users).values({
      id: 'u1',
      email: 'a@example.com',
      passwordHash: 'x',
      name: 'A',
    }).run()
    database.db.insert(categories).values({ id: 'c1', ownerId: 'u1', name: 'Work' }).run()
    database.db.insert(tasks).values({ id: 't1', ownerId: 'u1', title: 'Ship' }).run()
    database.db.insert(taskCategories).values({ taskId: 't1', categoryId: 'c1' }).run()

    expect(database.db.select().from(taskCategories).all()).toHaveLength(1)

    // Join rows have no independent value, so they still cascade.
    database.db.delete(tasks).where(eq(tasks.id, 't1')).run()

    expect(database.db.select().from(taskCategories).all()).toHaveLength(0)
    expect(database.db.select().from(categories).all()).toHaveLength(1)
  })

  it('rejects a task whose owner does not exist', () => {
    const database = freshDb()

    expect(() =>
      database.db.insert(tasks).values({ id: 't2', ownerId: 'ghost', title: 'Orphan' }).run(),
    ).toThrow(/FOREIGN KEY/i)
  })

  it('creates the parent directory and enables WAL for a file-backed database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adero-db-'))
    // Deliberately nested — proves mkdirSync(recursive) runs, since
    // better-sqlite3 throws SQLITE_CANTOPEN on a missing parent.
    const file = join(dir, 'nested', 'adero.db')

    const stub = { get: () => file } as unknown as ConfigService
    const database = new Database(stub)

    try {
      expect(existsSync(file)).toBe(true)

      const [{ journal_mode: mode }] = database.connection
        .prepare('PRAGMA journal_mode')
        .all() as Array<{ journal_mode: string }>
      expect(mode.toLowerCase()).toBe('wal')

      const [{ foreign_keys: fk }] = database.connection
        .prepare('PRAGMA foreign_keys')
        .all() as Array<{ foreign_keys: number }>
      expect(fk).toBe(1)
    } finally {
      database.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
