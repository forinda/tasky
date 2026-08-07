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

/** What the route hands back, run through the query's own queryFn. */
const run = (filters: BoardFilters = {}) =>
  (taskQueries.grouped(filters).queryFn as () => Promise<GroupedBoard>)()

beforeEach(() => get.mockReset())

describe('taskQueries.grouped', () => {
  it('keeps every column, including the empty ones and the null bucket', async () => {
    get.mockResolvedValue([
      { category: { id: 'w', name: 'Work', color: '#f00' }, tasks: [task('a')] },
      { category: { id: 'h', name: 'Home', color: null }, tasks: [] },
      { category: null, tasks: [task('b')] },
    ])

    const board = await run()

    expect(board.columns.map((c) => c.category?.name ?? null)).toEqual(['Work', 'Home', null])
    expect(board.truncated).toBe(false)
  })

  it('filters client-side, because the endpoint takes no query', async () => {
    get.mockResolvedValue([
      {
        category: { id: 'w', name: 'Work', color: null },
        tasks: [
          task('high', { priority: 'high' }),
          task('low', { priority: 'low', description: 'urgent-ish' }),
        ],
      },
      { category: null, tasks: [task('loose', { priority: 'high' })] },
    ])

    expect((await run({ priority: 'high' })).columns.map((c) => c.tasks.map((t) => t.id))).toEqual([
      ['high'],
      ['loose'],
    ])
    // `q` searches description as well as title — the server's searchable set.
    expect((await run({ q: 'URGENT' })).columns.flatMap((c) => c.tasks.map((t) => t.id))).toEqual([
      'low',
    ])
  })

  it('reports truncation from the JOINED row count, not the task count', async () => {
    // 250 tasks, each in two categories: 500 joined rows, the server's cap.
    const tasks = Array.from({ length: 250 }, (_, i) => task(`t${i}`, { categoryIds: ['a', 'b'] }))
    get.mockResolvedValue([
      { category: { id: 'a', name: 'A', color: null }, tasks },
      { category: { id: 'b', name: 'B', color: null }, tasks },
      { category: null, tasks: [] },
    ])

    // And a filter must not hide it: the cards it removes were still fetched.
    expect((await run()).truncated).toBe(true)
    expect((await run({ priority: 'high' })).truncated).toBe(true)
  })
})
