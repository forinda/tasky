import { describe, it, expect, afterEach } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '@/db/database'
import { users } from '@/db/schema'
import {
  deleteCategory,
  findCategory,
  insertCategory,
  listCategoriesPage,
  updateCategory,
} from '../categories.queries'

const MIGRATIONS = resolve(import.meta.dirname, '../../../db/migrations')
const EMPTY_QUERY = {
  filters: [],
  sort: [],
  pagination: { page: 1, limit: 20, offset: 0 },
  search: '',
}

let open: Database | undefined

afterEach(() => {
  open?.close()
  open = undefined
})

/**
 * These used to construct `CategoriesRepository`. The class is gone — the
 * owner-scoped statements it held are now plain functions in
 * `categories.queries.ts`, taking the drizzle handle instead of holding it —
 * so the subject changed and the assertions did not.
 */
function fresh() {
  const database = new Database(new ConfigService())
  // Assigned before migrate() so a migration failure still gets torn down.
  open = database
  migrate(database.db, { migrationsFolder: MIGRATIONS })

  // Two owners, because every meaningful assertion here is about the boundary
  // between them.
  database.db
    .insert(users)
    .values([
      { id: 'owner-a', email: 'a@example.com', passwordHash: 'h', name: 'A' },
      { id: 'owner-b', email: 'b@example.com', passwordHash: 'h', name: 'B' },
    ])
    .run()

  return database.db
}

describe('categories queries', () => {
  it('creates and finds a category for its owner', async () => {
    const db = fresh()
    const created = await insertCategory(db, 'owner-a', { name: 'Work' })

    expect(created.ownerId).toBe('owner-a')
    expect((await findCategory(db, 'owner-a', created.id))?.name).toBe('Work')
  })

  it('does not find another owner’s category', async () => {
    const db = fresh()
    const created = await insertCategory(db, 'owner-a', { name: 'Work' })

    expect(await findCategory(db, 'owner-b', created.id)).toBeNull()
  })

  it('lists only the caller’s categories', async () => {
    const db = fresh()
    await insertCategory(db, 'owner-a', { name: 'Work' })
    await insertCategory(db, 'owner-a', { name: 'Home' })
    await insertCategory(db, 'owner-b', { name: 'Secret' })

    const { data, total } = await listCategoriesPage(db, 'owner-a', EMPTY_QUERY)

    expect(total).toBe(2)
    expect(data.map((c) => c.name).sort()).toEqual(['Home', 'Work'])
  })

  it('allows two owners to use the same category name', async () => {
    const db = fresh()
    await insertCategory(db, 'owner-a', { name: 'Work' })

    // The unique constraint is (ownerId, name), not name. If this throws, the
    // constraint is global and every user shares a namespace.
    await expect(insertCategory(db, 'owner-b', { name: 'Work' })).resolves.toBeTruthy()
  })

  it('rejects a duplicate name for the same owner', async () => {
    const db = fresh()
    await insertCategory(db, 'owner-a', { name: 'Work' })

    await expect(insertCategory(db, 'owner-a', { name: 'Work' })).rejects.toThrow(/UNIQUE/i)
  })

  it('updates only within the owner', async () => {
    const db = fresh()
    const created = await insertCategory(db, 'owner-a', { name: 'Work' })

    expect(await updateCategory(db, 'owner-b', created.id, { name: 'Hijacked' })).toBeNull()
    expect((await findCategory(db, 'owner-a', created.id))?.name).toBe('Work')

    const updated = await updateCategory(db, 'owner-a', created.id, { name: 'Renamed' })
    expect(updated?.name).toBe('Renamed')
  })

  it('deletes only within the owner', async () => {
    const db = fresh()
    const created = await insertCategory(db, 'owner-a', { name: 'Work' })

    expect(await deleteCategory(db, 'owner-b', created.id)).toBe(false)
    expect(await findCategory(db, 'owner-a', created.id)).not.toBeNull()

    expect(await deleteCategory(db, 'owner-a', created.id)).toBe(true)
    expect(await findCategory(db, 'owner-a', created.id)).toBeNull()
  })

  it('respects pagination limit and offset', async () => {
    const db = fresh()
    for (const name of ['a', 'b', 'c', 'd', 'e']) await insertCategory(db, 'owner-a', { name })

    const page = await listCategoriesPage(db, 'owner-a', {
      ...EMPTY_QUERY,
      pagination: { page: 2, limit: 2, offset: 2 },
    })

    expect(page.data).toHaveLength(2)
    // total is the full owner-scoped count, not the page size — otherwise the
    // client cannot compute how many pages exist.
    expect(page.total).toBe(5)
  })

  it('searches within the owner only', async () => {
    const db = fresh()
    await insertCategory(db, 'owner-a', { name: 'Work stuff' })
    await insertCategory(db, 'owner-b', { name: 'Work secret' })

    const { data, total } = await listCategoriesPage(db, 'owner-a', {
      ...EMPTY_QUERY,
      search: 'Work',
    })

    expect(total).toBe(1)
    expect(data[0].name).toBe('Work stuff')
  })
})
