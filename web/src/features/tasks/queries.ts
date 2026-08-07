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
   *
   * Taken verbatim from the response. This used to be derived here, by summing
   * the columns and comparing against a copy of the server's cap kept in this
   * file — a number that drifts silently, because nothing fails on the day the
   * server changes it. The cap is the server's business and it now says so
   * itself, so this side no longer knows the number at all.
   */
  truncated: boolean
}

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
        const { columns, truncated } = await api.get('/tasks/grouped')

        return {
          columns: columns.map((column) => ({
            category: column.category,
            tasks: column.tasks.filter((task) => matchesFilters(task, filters)),
          })),
          // Passed through untouched, and deliberately NOT recomputed after the
          // filter: the cards a filter removes were still fetched, so hiding the
          // warning along with them would tell a user the board is complete
          // exactly when it is not.
          truncated,
        }
      },
    }),
}
