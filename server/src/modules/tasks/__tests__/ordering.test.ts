import { describe, it, expect, afterEach } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '@/db/database'
import { users, type Task } from '@/db/schema'
import { insertTask, movePosition, patchTask, selectById, selectPaginated } from '../tasks.queries'

const MIGRATIONS = resolve(import.meta.dirname, '../../../db/migrations')

const query = (filters: { field: string; operator: 'eq'; value: string }[] = []) => ({
  filters,
  sort: [],
  pagination: { page: 1, limit: 100, offset: 0 },
  search: '',
})

const inTodo = query([{ field: 'status', operator: 'eq' as const, value: 'todo' }])

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

/** A move that must have succeeded — narrows the MoveResult union in tests. */
function moved(result: Task | 'not-found' | 'unknown-anchor'): Task {
  expect(typeof result).not.toBe('string')
  return result as Task
}

const titles = (rows: { title: string }[]) => rows.map((r) => r.title)

describe('task ordering', () => {
  it('puts a new task at the TOP of its column', () => {
    const db = fresh()
    insertTask(db, 'owner-a', { title: 'first' }, [])
    insertTask(db, 'owner-a', { title: 'second' }, [])
    insertTask(db, 'owner-a', { title: 'third' }, [])

    const { data } = selectPaginated(db, 'owner-a', inTodo)

    // Newest first, because the client's optimistic insert puts it there.
    expect(titles(data)).toEqual(['third', 'second', 'first'])
  })

  it('orders a status-filtered list by position, and an unfiltered one by createdAt', () => {
    const db = fresh()
    const a = insertTask(db, 'owner-a', { title: 'a' }, [])
    insertTask(db, 'owner-a', { title: 'b' }, [])
    const c = insertTask(db, 'owner-a', { title: 'c' }, [])

    // Column order is now [c, b, a]; drag c to the bottom.
    moved(movePosition(db, c.id, 'owner-a', undefined, a.id))

    const filtered = selectPaginated(db, 'owner-a', inTodo)
    expect(titles(filtered.data)).toEqual(['b', 'a', 'c'])

    // Positions are assigned per status, so they are not comparable across
    // columns — an unfiltered list must NOT silently sort by them.
    const unfiltered = selectPaginated(db, 'owner-a', query())
    expect(titles(unfiltered.data)).toEqual(['a', 'b', 'c'])
  })

  it('moves a task directly below its anchor, and to the top for a null anchor', () => {
    const db = fresh()
    const a = insertTask(db, 'owner-a', { title: 'a' }, [])
    const b = insertTask(db, 'owner-a', { title: 'b' }, [])
    const c = insertTask(db, 'owner-a', { title: 'c' }, [])
    // [c, b, a]

    moved(movePosition(db, a.id, 'owner-a', undefined, c.id))
    expect(titles(selectPaginated(db, 'owner-a', inTodo).data)).toEqual(['c', 'a', 'b'])

    moved(movePosition(db, b.id, 'owner-a', undefined, null))
    expect(titles(selectPaginated(db, 'owner-a', inTodo).data)).toEqual(['b', 'c', 'a'])
  })

  it('moves between columns and lands where the anchor says', () => {
    const db = fresh()
    insertTask(db, 'owner-a', { title: 'done1', status: 'done' }, [])
    const done2 = insertTask(db, 'owner-a', { title: 'done2', status: 'done' }, [])
    const todo = insertTask(db, 'owner-a', { title: 'todo', status: 'todo' }, [])

    // The done column is [done2, done1]; drop the card between them.
    const result = moved(movePosition(db, todo.id, 'owner-a', 'done', done2.id))
    expect(result.status).toBe('done')

    const doneColumn = selectPaginated(
      db,
      'owner-a',
      query([{ field: 'status', operator: 'eq', value: 'done' }]),
    )
    expect(titles(doneColumn.data)).toEqual(['done2', 'todo', 'done1'])
  })

  it('rejects an anchor that is not in the target column', () => {
    const db = fresh()
    const done = insertTask(db, 'owner-a', { title: 'done', status: 'done' }, [])
    const todo = insertTask(db, 'owner-a', { title: 'todo' }, [])

    // Anchor lives in `done`, the move targets `todo`.
    expect(movePosition(db, todo.id, 'owner-a', 'todo', done.id)).toBe('unknown-anchor')
  })

  it('sends a task to the top of the new column when a plain update changes its status', () => {
    const db = fresh()
    insertTask(db, 'owner-a', { title: 'done1', status: 'done' }, [])
    insertTask(db, 'owner-a', { title: 'done2', status: 'done' }, [])
    const promoted = insertTask(db, 'owner-a', { title: 'promoted', status: 'todo' }, [])

    patchTask(db, promoted.id, 'owner-a', { status: 'done' }, undefined)

    const doneColumn = selectPaginated(
      db,
      'owner-a',
      query([{ field: 'status', operator: 'eq', value: 'done' }]),
    )
    // Not stranded at whatever height it held in the todo column.
    expect(titles(doneColumn.data)).toEqual(['promoted', 'done2', 'done1'])
  })

  it('leaves position alone when an update does not change the status', () => {
    const db = fresh()
    const a = insertTask(db, 'owner-a', { title: 'a' }, [])
    insertTask(db, 'owner-a', { title: 'b' }, [])

    patchTask(db, a.id, 'owner-a', { title: 'a renamed', status: 'todo' }, undefined)

    expect(titles(selectPaginated(db, 'owner-a', inTodo).data)).toEqual(['b', 'a renamed'])
  })

  describe('cross-owner', () => {
    it('cannot move another owner’s task', () => {
      const db = fresh()
      const hers = insertTask(db, 'owner-a', { title: 'hers' }, [])
      const his = insertTask(db, 'owner-b', { title: 'his' }, [])

      expect(movePosition(db, hers.id, 'owner-b', undefined, null)).toBe('not-found')

      // And it did not move: still alone at the top of her column.
      const hersAfter = selectById(db, hers.id, 'owner-a')
      expect(hersAfter?.position).toBe(0)
      expect(his.position).toBe(0)
    })

    it('cannot use another owner’s task as an anchor', () => {
      const db = fresh()
      const hers = insertTask(db, 'owner-a', { title: 'hers' }, [])
      const his = insertTask(db, 'owner-b', { title: 'his' }, [])

      // Indistinguishable from a made-up id — no oracle for her task ids.
      expect(movePosition(db, his.id, 'owner-b', undefined, hers.id)).toBe('unknown-anchor')
      expect(movePosition(db, his.id, 'owner-b', undefined, 'not-a-real-id')).toBe('unknown-anchor')
    })

    it('renumbers only the caller’s own bucket', () => {
      const db = fresh()
      const hers = insertTask(db, 'owner-a', { title: 'hers' }, [])
      const bottom = insertTask(db, 'owner-b', { title: 'bottom' }, [])
      const anchor = insertTask(db, 'owner-b', { title: 'anchor' }, [])

      // Enough splits of the same gap to force at least one rebalance.
      for (let i = 0; i < 40; i++) {
        const task = insertTask(db, 'owner-b', { title: `t${i}` }, [])
        moved(movePosition(db, task.id, 'owner-b', undefined, anchor.id))
      }

      expect(selectById(db, bottom.id, 'owner-b')!.position).toBeGreaterThan(0)
      // Her task was never in that bucket, so the renumber never touched it.
      expect(selectById(db, hers.id, 'owner-a')!.position).toBe(0)
    })
  })

  /**
   * The part everyone omits. Every iteration splits the SAME gap — the one
   * between `anchor` and whatever now sits below it — so it halves each time.
   * Without the rebalance the two neighbours become the same double at around
   * the 52nd split and the column's order stops being a total order at all;
   * with it, the bucket is renumbered long before that and this stays exact.
   */
  it('rebalances a bucket before repeated midpoints run out of precision', () => {
    const db = fresh()
    const bottom = insertTask(db, 'owner-a', { title: 'bottom' }, [])
    const anchor = insertTask(db, 'owner-a', { title: 'anchor' }, [])

    const inserted: string[] = []
    for (let i = 0; i < 60; i++) {
      const task = insertTask(db, 'owner-a', { title: `t${i}` }, [])
      moved(movePosition(db, task.id, 'owner-a', undefined, anchor.id))
      inserted.unshift(`t${i}`)
    }

    const { data } = selectPaginated(db, 'owner-a', inTodo)

    // Each task landed directly below the anchor, so the last one inserted is
    // nearest to it. Sixty midpoints of an un-rebalanced gap collide and this
    // sequence comes back scrambled.
    expect(titles(data)).toEqual(['anchor', ...inserted, 'bottom'])

    const positions = data.map((t) => t.position)
    expect(new Set(positions).size).toBe(positions.length)
    expect(positions).toEqual([...positions].sort((x, y) => x - y))

    // Proof the renumber actually ran rather than the assertions above passing
    // by luck: creates only ever go negative (min - 1) and midpoints of
    // negatives stay negative. Positive positions exist only after a rebalance
    // renumbers the bucket to 1, 2, 3…
    expect(Math.max(...positions)).toBeGreaterThan(0)
  })
})
