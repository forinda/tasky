import { queryOptions } from '@tanstack/react-query'
import type { TaskStatus } from '@/db/schema'
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
}
