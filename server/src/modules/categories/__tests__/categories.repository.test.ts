import { describe, it, expect, afterEach } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '@/db/database'
import { users } from '@/db/schema'
import { CategoriesRepository } from '../categories.repository'

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

function fresh(): CategoriesRepository {
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

  return new CategoriesRepository(database)
}

describe('CategoriesRepository', () => {
  it('creates and finds a category for its owner', async () => {
    const repo = fresh()
    const created = await repo.create('owner-a', { name: 'Work' })

    expect(created.ownerId).toBe('owner-a')
    expect((await repo.findById(created.id, 'owner-a'))?.name).toBe('Work')
  })

  it('does not find another owner’s category', async () => {
    const repo = fresh()
    const created = await repo.create('owner-a', { name: 'Work' })

    expect(await repo.findById(created.id, 'owner-b')).toBeNull()
  })

  it('lists only the caller’s categories', async () => {
    const repo = fresh()
    await repo.create('owner-a', { name: 'Work' })
    await repo.create('owner-a', { name: 'Home' })
    await repo.create('owner-b', { name: 'Secret' })

    const { data, total } = await repo.listPaginated('owner-a', EMPTY_QUERY)

    expect(total).toBe(2)
    expect(data.map((c) => c.name).sort()).toEqual(['Home', 'Work'])
  })

  it('allows two owners to use the same category name', async () => {
    const repo = fresh()
    await repo.create('owner-a', { name: 'Work' })

    // The unique constraint is (ownerId, name), not name. If this throws, the
    // constraint is global and every user shares a namespace.
    await expect(repo.create('owner-b', { name: 'Work' })).resolves.toBeTruthy()
  })

  it('rejects a duplicate name for the same owner', async () => {
    const repo = fresh()
    await repo.create('owner-a', { name: 'Work' })

    await expect(repo.create('owner-a', { name: 'Work' })).rejects.toThrow(/UNIQUE/i)
  })

  it('updates only within the owner', async () => {
    const repo = fresh()
    const created = await repo.create('owner-a', { name: 'Work' })

    expect(await repo.update(created.id, 'owner-b', { name: 'Hijacked' })).toBeNull()
    expect((await repo.findById(created.id, 'owner-a'))?.name).toBe('Work')

    const updated = await repo.update(created.id, 'owner-a', { name: 'Renamed' })
    expect(updated?.name).toBe('Renamed')
  })

  it('deletes only within the owner', async () => {
    const repo = fresh()
    const created = await repo.create('owner-a', { name: 'Work' })

    expect(await repo.remove(created.id, 'owner-b')).toBe(false)
    expect(await repo.findById(created.id, 'owner-a')).not.toBeNull()

    expect(await repo.remove(created.id, 'owner-a')).toBe(true)
    expect(await repo.findById(created.id, 'owner-a')).toBeNull()
  })

  it('respects pagination limit and offset', async () => {
    const repo = fresh()
    for (const name of ['a', 'b', 'c', 'd', 'e']) await repo.create('owner-a', { name })

    const page = await repo.listPaginated('owner-a', {
      ...EMPTY_QUERY,
      pagination: { page: 2, limit: 2, offset: 2 },
    })

    expect(page.data).toHaveLength(2)
    // total is the full owner-scoped count, not the page size — otherwise the
    // client cannot compute how many pages exist.
    expect(page.total).toBe(5)
  })

  it('searches within the owner only', async () => {
    const repo = fresh()
    await repo.create('owner-a', { name: 'Work stuff' })
    await repo.create('owner-b', { name: 'Work secret' })

    const { data, total } = await repo.listPaginated('owner-a', { ...EMPTY_QUERY, search: 'Work' })

    expect(total).toBe(1)
    expect(data[0].name).toBe('Work stuff')
  })
})
