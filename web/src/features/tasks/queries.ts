import { queryOptions } from '@tanstack/react-query'
import type { TaskStatus } from '@/db/schema'
import type { BoardTask } from '@/components/board/task-card'
import { api } from '@/lib/api'
import { taskKeys, type BoardFilters } from './keys'

/**
 * The server takes repeatable `filter=field:op:value` pairs, ANDed. Built here
 * rather than at each call site so the wire format has exactly one author.
 */
function filterParams(status: TaskStatus, filters: BoardFilters): string[] {
  const parts = [`status:eq:${status}`]
  if (filters.priority) parts.push(`priority:eq:${filters.priority}`)
  if (filters.categoryId) parts.push(`categoryId:eq:${filters.categoryId}`)
  return parts
}

/** A category, as `/tasks/grouped` names its columns. `color` is the user's own
 *  stored hex, the one place the board renders a colour it did not choose. */
export interface BoardCategory {
  id: string
  name: string
  color: string | null
}

/** One column of the grouped board. `category: null` is the uncategorized
 *  bucket, which the server always sends last and always sends. */
export interface GroupedColumn {
  category: BoardCategory | null
  tasks: BoardTask[]
}

export interface GroupedBoard {
  columns: GroupedColumn[]
  /**
   * The server capped the query and there are cards missing. It orders oldest
   * first, so what is missing is the NEWEST work — the half of the board a user
   * is most likely to notice the absence of.
   */
  truncated: boolean
}

/**
 * Mirrored from GROUPED_CAP in server/src/modules/tasks/tasks.service.ts, and
 * it cannot be imported: `@/db/schema` and the rest of server/ resolve for TYPES
 * only in this package, so a runtime import type-checks and then fails the
 * build. If the server's cap changes, this number is the one that has to follow.
 */
const GROUPED_CAP = 500

/** The server's filter semantics, re-implemented for a response it will not
 *  filter. `q` is a substring match over the searchable fields — see
 *  TASK_QUERY_CONFIG. */
function matchesFilters(task: BoardTask, filters: BoardFilters): boolean {
  if (filters.priority && task.priority !== filters.priority) return false
  if (filters.categoryId && !task.categoryIds.includes(filters.categoryId)) return false

  if (filters.q) {
    const needle = filters.q.toLowerCase()
    // Two separate tests, not the two fields concatenated: joining them lets a
    // query match across the seam and return a task containing neither.
    const inTitle = task.title.toLowerCase().includes(needle)
    const inDescription = (task.description ?? '').toLowerCase().includes(needle)
    if (!inTitle && !inDescription) return false
  }

  return true
}

/**
 * One query per column, not one list split in the browser.
 *
 * The server paginates. Fetching a single page and partitioning it by status
 * would show "the first 20 tasks, distributed" — a board that looks right and
 * quietly omits the rest, with no way for the user to tell.
 */
export const taskQueries = {
  column: (status: TaskStatus, filters: BoardFilters) =>
    queryOptions({
      queryKey: taskKeys.column(status, filters),
      queryFn: () =>
        api.get('/tasks', {
          query: {
            filter: filterParams(status, filters),
            ...(filters.q ? { q: filters.q } : {}),
            limit: 100,
          },
        }),
    }),

  /**
   * The category board. One request for every column, because that is what the
   * endpoint is: not paginated, no query parameters, all columns at once.
   *
   * The filters are therefore applied HERE rather than by the server. That is
   * safe only because the response is the whole board — filtering a page would
   * hide rows the server never sent, which is the bug `column` above exists to
   * avoid. The predicates mirror the server's: `eq` on priority, membership for
   * categoryId, and `q` against the searchable fields (title, description).
   */
  grouped: (filters: BoardFilters) =>
    queryOptions({
      queryKey: taskKeys.grouped(filters),
      queryFn: async (): Promise<GroupedBoard> => {
        const columns: GroupedColumn[] = await api.get('/tasks/grouped')

        // Every card in every column is exactly one joined row: a task in three
        // categories appears in three columns and spent three of them, and an
        // uncategorized task is the one row its LEFT JOIN produced. So this sum
        // IS the row count the server capped — count it before filtering, or a
        // filter would hide the truncation instead of the tasks.
        const rows = columns.reduce((total, column) => total + column.tasks.length, 0)

        return {
          columns: columns.map((column) => ({
            category: column.category,
            tasks: column.tasks.filter((task) => matchesFilters(task, filters)),
          })),
          truncated: rows >= GROUPED_CAP,
        }
      },
    }),
}
