import { describe, it, expect, afterEach } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '@/db/database'
import { categories, taskCategories, tasks, users } from '@/db/schema'
import {
  deleteTask,
  findCategoryIds,
  insertTask,
  ownedCategoryIds,
  replaceCategories,
} from '../tasks.queries'

const MIGRATIONS = resolve(import.meta.dirname, '../../../db/migrations')

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

  database.db
    .insert(categories)
    .values([
      { id: 'cat-a1', ownerId: 'owner-a', name: 'Work' },
      { id: 'cat-a2', ownerId: 'owner-a', name: 'Home' },
      { id: 'cat-a3', ownerId: 'owner-a', name: 'Errands' },
      { id: 'cat-b1', ownerId: 'owner-b', name: 'Theirs' },
    ])
    .run()

  return database.db
}

describe('task category links', () => {
  it('writes a join row per category on create', () => {
    const db = fresh()
    const task = insertTask(db, 'owner-a', { title: 'Ship' }, ['cat-a1', 'cat-a2'])

    expect(findCategoryIds(db, task.id).sort()).toEqual(['cat-a1', 'cat-a2'])
  })

  it('creates with no categories when none are given', () => {
    const db = fresh()
    const task = insertTask(db, 'owner-a', { title: 'Ship' }, [])

    expect(findCategoryIds(db, task.id)).toEqual([])
  })

  it('replaces the category set wholesale rather than merging', () => {
    const db = fresh()
    const task = insertTask(db, 'owner-a', { title: 'Ship' }, ['cat-a1', 'cat-a2'])

    expect(replaceCategories(db, task.id, 'owner-a', ['cat-a2', 'cat-a3'])).toBe(true)

    // cat-a1 must be gone. A merge would leave all three.
    expect(findCategoryIds(db, task.id).sort()).toEqual(['cat-a2', 'cat-a3'])
  })

  it('clears all links when given an empty set', () => {
    const db = fresh()
    const task = insertTask(db, 'owner-a', { title: 'Ship' }, ['cat-a1'])

    expect(replaceCategories(db, task.id, 'owner-a', [])).toBe(true)
    expect(findCategoryIds(db, task.id)).toEqual([])
    // The task itself survives.
    expect(db.select().from(tasks).all()).toHaveLength(1)
  })

  it('refuses to replace links on another owner’s task', () => {
    const db = fresh()
    const task = insertTask(db, 'owner-a', { title: 'Ship' }, ['cat-a1'])

    expect(replaceCategories(db, task.id, 'owner-b', ['cat-b1'])).toBe(false)
    expect(findCategoryIds(db, task.id)).toEqual(['cat-a1'])
  })

  it('writes NOTHING when a link fails part-way', () => {
    const db = fresh()

    // The second id does not exist, so the join insert violates the foreign
    // key AFTER the task row has been inserted. Without a transaction the task
    // survives with no links — a half-written record.
    expect(() =>
      insertTask(db, 'owner-a', { title: 'Ship' }, ['cat-a1', 'ghost-category']),
    ).toThrow()

    expect(db.select().from(tasks).all()).toHaveLength(0)
    expect(db.select().from(taskCategories).all()).toHaveLength(0)
  })

  it('reports which of the given ids the owner actually holds', () => {
    const db = fresh()

    const owned = ownedCategoryIds(db, 'owner-a', ['cat-a1', 'cat-b1', 'ghost'])

    // Another owner's id and a nonexistent id are both simply absent — the
    // caller cannot tell them apart, which is what keeps the 422 from becoming
    // a probe for other users' category ids.
    expect(owned).toEqual(['cat-a1'])
  })

  it('returns an empty list for an empty request', () => {
    const db = fresh()
    expect(ownedCategoryIds(db, 'owner-a', [])).toEqual([])
  })

  it('drops join rows when the task is deleted, leaving the categories', () => {
    const db = fresh()
    const task = insertTask(db, 'owner-a', { title: 'Ship' }, ['cat-a1', 'cat-a2'])

    expect(deleteTask(db, task.id, 'owner-a')).toBe(true)

    expect(db.select().from(taskCategories).all()).toHaveLength(0)
    expect(db.select().from(categories).all()).toHaveLength(4)
  })
})
