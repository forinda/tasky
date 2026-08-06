import { describe, it, expect, afterEach } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '@/db/database'
import { categories, taskCategories, tasks, users } from '@/db/schema'
import { TasksRepository } from '../tasks.repository'

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

  return { repo: new TasksRepository(database), database }
}

describe('task category links', () => {
  it('writes a join row per category on create', () => {
    const { repo } = fresh()
    const task = repo.createWithCategories('owner-a', { title: 'Ship' }, ['cat-a1', 'cat-a2'])

    expect(repo.findCategoryIds(task.id).sort()).toEqual(['cat-a1', 'cat-a2'])
  })

  it('creates with no categories when none are given', () => {
    const { repo } = fresh()
    const task = repo.createWithCategories('owner-a', { title: 'Ship' }, [])

    expect(repo.findCategoryIds(task.id)).toEqual([])
  })

  it('replaces the category set wholesale rather than merging', () => {
    const { repo } = fresh()
    const task = repo.createWithCategories('owner-a', { title: 'Ship' }, ['cat-a1', 'cat-a2'])

    expect(repo.replaceCategories(task.id, 'owner-a', ['cat-a2', 'cat-a3'])).toBe(true)

    // cat-a1 must be gone. A merge would leave all three.
    expect(repo.findCategoryIds(task.id).sort()).toEqual(['cat-a2', 'cat-a3'])
  })

  it('clears all links when given an empty set', () => {
    const { repo, database } = fresh()
    const task = repo.createWithCategories('owner-a', { title: 'Ship' }, ['cat-a1'])

    expect(repo.replaceCategories(task.id, 'owner-a', [])).toBe(true)
    expect(repo.findCategoryIds(task.id)).toEqual([])
    // The task itself survives.
    expect(database.db.select().from(tasks).all()).toHaveLength(1)
  })

  it('refuses to replace links on another owner’s task', () => {
    const { repo } = fresh()
    const task = repo.createWithCategories('owner-a', { title: 'Ship' }, ['cat-a1'])

    expect(repo.replaceCategories(task.id, 'owner-b', ['cat-b1'])).toBe(false)
    expect(repo.findCategoryIds(task.id)).toEqual(['cat-a1'])
  })

  it('writes NOTHING when a link fails part-way', () => {
    const { repo, database } = fresh()

    // The second id does not exist, so the join insert violates the foreign
    // key AFTER the task row has been inserted. Without a transaction the task
    // survives with no links — a half-written record.
    expect(() =>
      repo.createWithCategories('owner-a', { title: 'Ship' }, ['cat-a1', 'ghost-category']),
    ).toThrow()

    expect(database.db.select().from(tasks).all()).toHaveLength(0)
    expect(database.db.select().from(taskCategories).all()).toHaveLength(0)
  })

  it('reports which of the given ids the owner actually holds', () => {
    const { repo } = fresh()

    const owned = repo.ownedCategoryIds('owner-a', ['cat-a1', 'cat-b1', 'ghost'])

    // Another owner's id and a nonexistent id are both simply absent — the
    // caller cannot tell them apart, which is what keeps the 422 from becoming
    // a probe for other users' category ids.
    expect(owned).toEqual(['cat-a1'])
  })

  it('returns an empty list for an empty request', () => {
    const { repo } = fresh()
    expect(repo.ownedCategoryIds('owner-a', [])).toEqual([])
  })

  it('drops join rows when the task is deleted, leaving the categories', async () => {
    const { repo, database } = fresh()
    const task = repo.createWithCategories('owner-a', { title: 'Ship' }, ['cat-a1', 'cat-a2'])

    expect(await repo.remove(task.id, 'owner-a')).toBe(true)

    expect(database.db.select().from(taskCategories).all()).toHaveLength(0)
    expect(database.db.select().from(categories).all()).toHaveLength(4)
  })
})
