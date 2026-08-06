import { describe, it, expect, afterEach } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '@/db/database'
import { users } from '@/db/schema'
import { TasksRepository } from '../tasks.repository'

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

function fresh(): TasksRepository {
  const database = new Database(new ConfigService())
  open = database
  migrate(database.db, { migrationsFolder: MIGRATIONS })

  database.db
    .insert(users)
    .values([
      { id: 'owner-a', email: 'a@example.com', passwordHash: 'h', name: 'A' },
      { id: 'owner-b', email: 'b@example.com', passwordHash: 'h', name: 'B' },
    ])
    .run()

  return new TasksRepository(database)
}

describe('TasksRepository', () => {
  it('creates and finds a task for its owner', async () => {
    const repo = fresh()
    const created = await repo.create('owner-a', { title: 'Ship it' })

    expect(created.ownerId).toBe('owner-a')
    expect(created.status).toBe('todo')
    expect(created.priority).toBe('medium')
    expect((await repo.findById(created.id, 'owner-a'))?.title).toBe('Ship it')
  })

  it('does not find another owner’s task', async () => {
    const repo = fresh()
    const created = await repo.create('owner-a', { title: 'Ship it' })

    expect(await repo.findById(created.id, 'owner-b')).toBeNull()
  })

  it('lists only the caller’s tasks', async () => {
    const repo = fresh()
    await repo.create('owner-a', { title: 'Mine one' })
    await repo.create('owner-a', { title: 'Mine two' })
    await repo.create('owner-b', { title: 'Theirs' })

    const { data, total } = await repo.listPaginated('owner-a', EMPTY_QUERY)

    expect(total).toBe(2)
    expect(data.map((t) => t.title).sort()).toEqual(['Mine one', 'Mine two'])
  })

  it('updates and removes only within the owner', async () => {
    const repo = fresh()
    const created = await repo.create('owner-a', { title: 'Ship it' })

    expect(await repo.update(created.id, 'owner-b', { title: 'Hijacked' })).toBeNull()
    expect(await repo.remove(created.id, 'owner-b')).toBe(false)
    expect((await repo.findById(created.id, 'owner-a'))?.title).toBe('Ship it')

    expect((await repo.update(created.id, 'owner-a', { title: 'Renamed' }))?.title).toBe('Renamed')
    expect(await repo.remove(created.id, 'owner-a')).toBe(true)
  })

  it('filters by status', async () => {
    const repo = fresh()
    await repo.create('owner-a', { title: 'A', status: 'done' })
    await repo.create('owner-a', { title: 'B', status: 'todo' })

    const { data, total } = await repo.listPaginated('owner-a', {
      ...EMPTY_QUERY,
      filters: [{ field: 'status', operator: 'eq', value: 'done' }],
    })

    expect(total).toBe(1)
    expect(data[0].title).toBe('A')
  })

  it('filters by priority', async () => {
    const repo = fresh()
    await repo.create('owner-a', { title: 'A', priority: 'high' })
    await repo.create('owner-a', { title: 'B', priority: 'low' })

    const { data } = await repo.listPaginated('owner-a', {
      ...EMPTY_QUERY,
      filters: [{ field: 'priority', operator: 'eq', value: 'high' }],
    })

    expect(data.map((t) => t.title)).toEqual(['A'])
  })

  it('combines filters by narrowing, not widening', async () => {
    const repo = fresh()
    await repo.create('owner-a', { title: 'Match', status: 'done', priority: 'high' })
    await repo.create('owner-a', { title: 'Status only', status: 'done', priority: 'low' })
    await repo.create('owner-a', { title: 'Priority only', status: 'todo', priority: 'high' })

    const { data, total } = await repo.listPaginated('owner-a', {
      ...EMPTY_QUERY,
      filters: [
        { field: 'status', operator: 'eq', value: 'done' },
        { field: 'priority', operator: 'eq', value: 'high' },
      ],
    })

    expect(total).toBe(1)
    expect(data[0].title).toBe('Match')
  })

  it('ignores a filter whose value is outside the enum rather than matching everything', async () => {
    const repo = fresh()
    await repo.create('owner-a', { title: 'A', status: 'done' })

    const { total } = await repo.listPaginated('owner-a', {
      ...EMPTY_QUERY,
      filters: [{ field: 'status', operator: 'eq', value: 'not-a-status' }],
    })

    // Defence in depth — the service rejects this with 422 before it reaches
    // here. What must never happen is the predicate silently disappearing and
    // the query returning the unfiltered set.
    expect(total).toBe(0)
  })

  it('searches title and description within the owner only', async () => {
    const repo = fresh()
    await repo.create('owner-a', { title: 'Deploy the thing' })
    await repo.create('owner-a', { title: 'Unrelated', description: 'must deploy first' })
    await repo.create('owner-a', { title: 'Nothing relevant' })
    await repo.create('owner-b', { title: 'Deploy secret' })

    const { data, total } = await repo.listPaginated('owner-a', {
      ...EMPTY_QUERY,
      search: 'deploy',
    })

    expect(total).toBe(2)
    expect(data.map((t) => t.title).sort()).toEqual(['Deploy the thing', 'Unrelated'])
  })

  it('sorts by priority semantically, not alphabetically', async () => {
    const repo = fresh()
    await repo.create('owner-a', { title: 'low one', priority: 'low' })
    await repo.create('owner-a', { title: 'high one', priority: 'high' })
    await repo.create('owner-a', { title: 'medium one', priority: 'medium' })

    const { data } = await repo.listPaginated('owner-a', {
      ...EMPTY_QUERY,
      sort: [{ field: 'priority', direction: 'asc' }],
    })

    // Alphabetical would give high, low, medium — plausible-looking and wrong.
    expect(data.map((t) => t.priority)).toEqual(['high', 'medium', 'low'])
  })

  it('respects pagination with total scoped to the owner', async () => {
    const repo = fresh()
    for (const n of ['a', 'b', 'c', 'd', 'e']) await repo.create('owner-a', { title: n })
    await repo.create('owner-b', { title: 'theirs' })

    const page = await repo.listPaginated('owner-a', {
      ...EMPTY_QUERY,
      pagination: { page: 2, limit: 2, offset: 2 },
    })

    expect(page.data).toHaveLength(2)
    expect(page.total).toBe(5)
  })
})
