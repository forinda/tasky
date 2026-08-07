import { describe, it, expect, vi, beforeEach } from 'vitest'
import { taskQueries, type GroupedBoard, type GroupedColumn } from '../queries'
import type { BoardFilters } from '../keys'

// Hoisted, because vi.mock runs before the imports above.
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get } }))

function task(id: string, over: Partial<GroupedColumn['tasks'][number]> = {}) {
  return {
    id,
    title: id,
    description: null,
    priority: 'medium',
    status: 'todo',
    categoryIds: [] as string[],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

/** The wire shape: `{ columns, truncated }`, because the cap is the server's
 *  number and the server is the only party that can say whether it was hit. */
const board = (columns: unknown[], truncated = false) => ({ columns, truncated })

/** What the route hands back, run through the query's own queryFn. */
const run = (filters: BoardFilters = {}) =>
  (taskQueries.grouped(filters).queryFn as () => Promise<GroupedBoard>)()

beforeEach(() => get.mockReset())

describe('taskQueries.grouped', () => {
  it('keeps every column, including the empty ones and the null bucket', async () => {
    get.mockResolvedValue(
      board([
        { category: { id: 'w', name: 'Work', color: '#f00' }, tasks: [task('a')] },
        { category: { id: 'h', name: 'Home', color: null }, tasks: [] },
        { category: null, tasks: [task('b')] },
      ]),
    )

    const result = await run()

    expect(result.columns.map((c) => c.category?.name ?? null)).toEqual(['Work', 'Home', null])
    expect(result.truncated).toBe(false)
  })

  it('filters client-side, because the endpoint takes no query', async () => {
    get.mockResolvedValue(
      board([
        {
          category: { id: 'w', name: 'Work', color: null },
          tasks: [
            task('high', { priority: 'high' }),
            task('low', { priority: 'low', description: 'urgent-ish' }),
          ],
        },
        { category: null, tasks: [task('loose', { priority: 'high' })] },
      ]),
    )

    expect((await run({ priority: 'high' })).columns.map((c) => c.tasks.map((t) => t.id))).toEqual([
      ['high'],
      ['loose'],
    ])
    // `q` searches description as well as title — the server's searchable set.
    expect((await run({ q: 'URGENT' })).columns.flatMap((c) => c.tasks.map((t) => t.id))).toEqual([
      'low',
    ])
  })

  it('reports the truncation the SERVER states, and no filter can hide it', async () => {
    // 250 tasks, each in two categories — 500 joined rows, which is the cap
    // today. The board is only truncated because the server SAYS so; this file
    // no longer knows the number, and that is the point.
    const tasks = Array.from({ length: 250 }, (_, i) => task(`t${i}`, { categoryIds: ['a', 'b'] }))
    get.mockResolvedValue(
      board(
        [
          { category: { id: 'a', name: 'A', color: null }, tasks },
          { category: { id: 'b', name: 'B', color: null }, tasks },
          { category: null, tasks: [] },
        ],
        true,
      ),
    )

    expect((await run()).truncated).toBe(true)
    // A filter removes cards that were still fetched, so clearing the warning
    // with them would claim a complete board exactly when it is not.
    expect((await run({ priority: 'high' })).truncated).toBe(true)
    expect((await run({ q: 'nothing matches this' })).truncated).toBe(true)
  })

  it('does not re-derive truncation from the row count it can see', async () => {
    // The SAME 500 joined rows, with the server reporting a complete board —
    // a cap that has since been raised. Anything that infers truncation from a
    // row count against a copy of the old cap answers `true` here and lies.
    const tasks = Array.from({ length: 250 }, (_, i) => task(`t${i}`, { categoryIds: ['a', 'b'] }))
    get.mockResolvedValue(
      board(
        [
          { category: { id: 'a', name: 'A', color: null }, tasks },
          { category: { id: 'b', name: 'B', color: null }, tasks },
          { category: null, tasks: [] },
        ],
        false,
      ),
    )

    expect((await run()).truncated).toBe(false)
  })

  it('reports a truncated board even when it is a small one', async () => {
    // The converse: two cards and a `true`. A cap counts JOINED rows and the
    // server may lower it, so "few cards" is not evidence of a whole board —
    // only the flag is.
    get.mockResolvedValue(board([{ category: null, tasks: [task('a'), task('b')] }], true))

    expect((await run()).truncated).toBe(true)
  })
})
