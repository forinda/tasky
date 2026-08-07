import { describe, it, expect, afterEach, vi } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '@/db/database'
import { categories, users } from '@/db/schema'
import { ListCategoryTasksUseCase } from '@/modules/categories/use-cases/list-category-tasks.use-case'
import { insertTask } from '../tasks.queries'
import { ListTasksUseCase } from '../use-cases/list-tasks.use-case'

/**
 * Both use cases read the owner from the request frame, and there is no frame
 * here — this drives them directly rather than over HTTP, because the thing
 * under test is how MANY statements a page costs, and a supertest round trip
 * puts auth, middleware and the container between the spy and the answer.
 */
vi.mock('@/shared/context', () => ({ currentOwnerId: () => 'owner-a' }))

const MIGRATIONS = resolve(import.meta.dirname, '../../../db/migrations')
const EMPTY_QUERY = {
  filters: [],
  sort: [],
  pagination: { page: 1, limit: 50, offset: 0 },
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
    .values({ id: 'owner-a', email: 'a@example.com', passwordHash: 'h', name: 'A' })
    .run()
  database.db.insert(categories).values({ id: 'cat-a1', ownerId: 'owner-a', name: 'Work' }).run()

  return database
}

const seed = (database: Database, count: number) => {
  for (let i = 0; i < count; i++) {
    insertTask(database.db, 'owner-a', { title: `task ${i}` }, ['cat-a1'])
  }
}

/**
 * How many SQL statements `run` issued. The seam is better-sqlite3's own
 * `prepare` rather than anything on the drizzle handle: drizzle prepares once
 * per executed builder and caches nothing between them, so this counts real
 * round trips and cannot be fooled by a read that reaches the database some
 * other way.
 *
 * The count is read BEFORE `mockRestore`, which resets the call history along
 * with the implementation — assert after it and every such test passes on zero.
 */
async function statements(database: Database, run: () => Promise<unknown>): Promise<number> {
  const spy = vi.spyOn(database.connection, 'prepare')
  try {
    await run()
    return spy.mock.calls.length
  } finally {
    spy.mockRestore()
  }
}

describe('listing a page costs a constant number of queries', () => {
  it('GET /tasks does not grow a query per row', async () => {
    const database = fresh()
    const useCase = new ListTasksUseCase(database)

    seed(database, 2)
    const small = await statements(database, () => useCase.execute(EMPTY_QUERY))

    seed(database, 18)
    const large = await statements(database, () => useCase.execute(EMPTY_QUERY))

    // Asserted as a RELATION, not a magic number: the N+1 this replaced grew
    // one statement per row, so 2 rows and 20 rows differed by 18. A fixed
    // count would also have to be rewritten by anyone who legitimately adds a
    // query to the path; "does not depend on the row count" is the actual
    // claim and the only one worth pinning.
    expect(large).toBe(small)
    // Not vacuous: a seam that observes nothing reports 0 === 0 and proves it.
    expect(small).toBeGreaterThan(0)
    expect((await useCase.execute(EMPTY_QUERY)).data).toHaveLength(20)
  })

  it('GET /categories/:id/tasks does not grow a query per row either', async () => {
    const database = fresh()
    const useCase = new ListCategoryTasksUseCase(database)

    seed(database, 2)
    const small = await statements(database, () => useCase.execute('cat-a1', EMPTY_QUERY))

    seed(database, 18)
    const large = await statements(database, () => useCase.execute('cat-a1', EMPTY_QUERY))

    // Same helper, same guarantee. The two endpoints share one batched lookup
    // precisely so this cannot regress on one of them alone.
    expect(large).toBe(small)
    expect(small).toBeGreaterThan(0)
    expect((await useCase.execute('cat-a1', EMPTY_QUERY)).data).toHaveLength(20)
  })

  it('still returns each row’s own links, not one row’s links for all of them', async () => {
    const database = fresh()
    database.db.insert(categories).values({ id: 'cat-a2', ownerId: 'owner-a', name: 'Home' }).run()

    const both = insertTask(database.db, 'owner-a', { title: 'both' }, ['cat-a1', 'cat-a2'])
    const one = insertTask(database.db, 'owner-a', { title: 'one' }, ['cat-a1'])
    const none = insertTask(database.db, 'owner-a', { title: 'none' }, [])

    const { data } = await new ListTasksUseCase(database).execute(EMPTY_QUERY)
    const byId = new Map(data.map((task) => [task.id, [...task.categoryIds].sort()]))

    // A batch that grouped its rows wrongly still returns the right COUNT of
    // tasks — the failure is silent unless the links are checked per task.
    expect(byId.get(both.id)).toEqual(['cat-a1', 'cat-a2'])
    expect(byId.get(one.id)).toEqual(['cat-a1'])
    expect(byId.get(none.id)).toEqual([])
  })
})
