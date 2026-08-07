import { describe, it, expect, afterEach, vi } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '@/db/database'
import { categories, users } from '@/db/schema'
import {
  deleteTask,
  findCategoryIdsByTask,
  insertTask,
  patchTask,
  selectById,
  selectPaginated,
} from '../tasks.queries'

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

function fresh() {
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

  return database.db
}

describe('tasks queries', () => {
  it('creates and finds a task for its owner', () => {
    const db = fresh()
    const created = insertTask(db, 'owner-a', { title: 'Ship it' }, [])

    expect(created.ownerId).toBe('owner-a')
    expect(created.status).toBe('todo')
    expect(created.priority).toBe('medium')
    expect(selectById(db, created.id, 'owner-a')?.title).toBe('Ship it')
  })

  it('does not find another owner’s task', () => {
    const db = fresh()
    const created = insertTask(db, 'owner-a', { title: 'Ship it' }, [])

    expect(selectById(db, created.id, 'owner-b')).toBeNull()
  })

  it('lists only the caller’s tasks', () => {
    const db = fresh()
    insertTask(db, 'owner-a', { title: 'Mine one' }, [])
    insertTask(db, 'owner-a', { title: 'Mine two' }, [])
    insertTask(db, 'owner-b', { title: 'Theirs' }, [])

    const { data, total } = selectPaginated(db, 'owner-a', EMPTY_QUERY)

    expect(total).toBe(2)
    expect(data.map((t) => t.title).sort()).toEqual(['Mine one', 'Mine two'])
  })

  it('updates and removes only within the owner', () => {
    const db = fresh()
    const created = insertTask(db, 'owner-a', { title: 'Ship it' }, [])

    expect(patchTask(db, created.id, 'owner-b', { title: 'Hijacked' }, undefined)).toBeNull()
    expect(deleteTask(db, created.id, 'owner-b')).toBe(false)
    expect(selectById(db, created.id, 'owner-a')?.title).toBe('Ship it')

    expect(patchTask(db, created.id, 'owner-a', { title: 'Renamed' }, undefined)?.title).toBe(
      'Renamed',
    )
    expect(deleteTask(db, created.id, 'owner-a')).toBe(true)
  })

  it('filters by status', () => {
    const db = fresh()
    insertTask(db, 'owner-a', { title: 'A', status: 'done' }, [])
    insertTask(db, 'owner-a', { title: 'B', status: 'todo' }, [])

    const { data, total } = selectPaginated(db, 'owner-a', {
      ...EMPTY_QUERY,
      filters: [{ field: 'status', operator: 'eq', value: 'done' }],
    })

    expect(total).toBe(1)
    expect(data[0].title).toBe('A')
  })

  it('filters by priority', () => {
    const db = fresh()
    insertTask(db, 'owner-a', { title: 'A', priority: 'high' }, [])
    insertTask(db, 'owner-a', { title: 'B', priority: 'low' }, [])

    const { data } = selectPaginated(db, 'owner-a', {
      ...EMPTY_QUERY,
      filters: [{ field: 'priority', operator: 'eq', value: 'high' }],
    })

    expect(data.map((t) => t.title)).toEqual(['A'])
  })

  it('combines filters by narrowing, not widening', () => {
    const db = fresh()
    insertTask(db, 'owner-a', { title: 'Match', status: 'done', priority: 'high' }, [])
    insertTask(db, 'owner-a', { title: 'Status only', status: 'done', priority: 'low' }, [])
    insertTask(db, 'owner-a', { title: 'Priority only', status: 'todo', priority: 'high' }, [])

    const { data, total } = selectPaginated(db, 'owner-a', {
      ...EMPTY_QUERY,
      filters: [
        { field: 'status', operator: 'eq', value: 'done' },
        { field: 'priority', operator: 'eq', value: 'high' },
      ],
    })

    expect(total).toBe(1)
    expect(data[0].title).toBe('Match')
  })

  it('ignores a filter whose value is outside the enum rather than matching everything', () => {
    const db = fresh()
    insertTask(db, 'owner-a', { title: 'A', status: 'done' }, [])

    const { total } = selectPaginated(db, 'owner-a', {
      ...EMPTY_QUERY,
      filters: [{ field: 'status', operator: 'eq', value: 'not-a-status' }],
    })

    // Defence in depth — the service rejects this with 422 before it reaches
    // here. What must never happen is the predicate silently disappearing and
    // the query returning the unfiltered set.
    expect(total).toBe(0)
  })

  it('searches title and description within the owner only', () => {
    const db = fresh()
    insertTask(db, 'owner-a', { title: 'Deploy the thing' }, [])
    insertTask(db, 'owner-a', { title: 'Unrelated', description: 'must deploy first' }, [])
    insertTask(db, 'owner-a', { title: 'Nothing relevant' }, [])
    insertTask(db, 'owner-b', { title: 'Deploy secret' }, [])

    const { data, total } = selectPaginated(db, 'owner-a', {
      ...EMPTY_QUERY,
      search: 'deploy',
    })

    expect(total).toBe(2)
    expect(data.map((t) => t.title).sort()).toEqual(['Deploy the thing', 'Unrelated'])
  })

  it('sorts by priority semantically, not alphabetically', () => {
    const db = fresh()
    insertTask(db, 'owner-a', { title: 'low one', priority: 'low' }, [])
    insertTask(db, 'owner-a', { title: 'high one', priority: 'high' }, [])
    insertTask(db, 'owner-a', { title: 'medium one', priority: 'medium' }, [])

    const { data } = selectPaginated(db, 'owner-a', {
      ...EMPTY_QUERY,
      sort: [{ field: 'priority', direction: 'asc' }],
    })

    // Alphabetical would give high, low, medium — plausible-looking and wrong.
    expect(data.map((t) => t.priority)).toEqual(['high', 'medium', 'low'])
  })

  it('respects pagination with total scoped to the owner', () => {
    const db = fresh()
    for (const n of ['a', 'b', 'c', 'd', 'e']) insertTask(db, 'owner-a', { title: n }, [])
    insertTask(db, 'owner-b', { title: 'theirs' }, [])

    const page = selectPaginated(db, 'owner-a', {
      ...EMPTY_QUERY,
      pagination: { page: 2, limit: 2, offset: 2 },
    })

    expect(page.data).toHaveLength(2)
    expect(page.total).toBe(5)
  })
})

describe('findCategoryIdsByTask', () => {
  function withCategories() {
    const db = fresh()
    db.insert(categories)
      .values([
        { id: 'cat-a1', ownerId: 'owner-a', name: 'Work' },
        { id: 'cat-a2', ownerId: 'owner-a', name: 'Home' },
        { id: 'cat-b1', ownerId: 'owner-b', name: 'Theirs' },
      ])
      .run()
    return db
  }

  it('groups a whole page of links in ONE query', () => {
    const db = withCategories()
    const one = insertTask(db, 'owner-a', { title: 'one' }, ['cat-a1', 'cat-a2'])
    const two = insertTask(db, 'owner-a', { title: 'two' }, ['cat-a2'])
    const three = insertTask(db, 'owner-a', { title: 'three' }, [])

    const select = vi.spyOn(db, 'select')
    const links = findCategoryIdsByTask(db, 'owner-a', [one.id, two.id, three.id])
    // Read BEFORE restoring: `mockRestore` resets the call history as well as
    // the implementation, so asserting after it always sees zero and passes.
    const statements = select.mock.calls.length
    select.mockRestore()

    // The code this replaced issued one statement per row. Three rows, one
    // statement, regardless of how many rows there are.
    expect(statements).toBe(1)
    expect(links.get(one.id)?.sort()).toEqual(['cat-a1', 'cat-a2'])
    expect(links.get(two.id)).toEqual(['cat-a2'])
    // Present with an empty list, not absent: a caller must never have to tell
    // "this task has no categories" apart from "this task is missing".
    expect(links.get(three.id)).toEqual([])
  })

  it('returns nothing for another owner’s task, however that id got into the batch', () => {
    const db = withCategories()
    const theirs = insertTask(db, 'owner-b', { title: 'Theirs' }, ['cat-b1'])

    // `task_categories` has no owner column, so a batch keyed on task ids alone
    // hands the caller whatever those ids link to — including someone else's
    // categories. THIS is the assertion that fails the moment the owner
    // predicate is dropped from the batched query.
    expect(findCategoryIdsByTask(db, 'owner-a', [theirs.id]).get(theirs.id)).toEqual([])
    // And it is a scope, not a blanket refusal: the real owner still gets them.
    expect(findCategoryIdsByTask(db, 'owner-b', [theirs.id]).get(theirs.id)).toEqual(['cat-b1'])
  })

  it('issues no query at all for an empty page', () => {
    const db = withCategories()

    const select = vi.spyOn(db, 'select')
    const links = findCategoryIdsByTask(db, 'owner-a', [])
    const statements = select.mock.calls.length
    select.mockRestore()

    expect(links.size).toBe(0)
    // `inArray(column, [])` is not a no-op in SQL — skipping the round trip
    // entirely is cheaper and dodges the empty-list edge case outright.
    expect(statements).toBe(0)
  })
})
