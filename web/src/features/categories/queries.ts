import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { categoryKeys } from './keys'

/**
 * The board filters by category and shows category names on cards; this list
 * also backs the management screen, where the same rows are renamed and
 * recoloured.
 */
export const categoryQueries = {
  list: () =>
    queryOptions({
      queryKey: categoryKeys.list(),
      queryFn: () => api.get('/categories', { query: { limit: 100 } }),
    }),

  /**
   * How many tasks each category holds, as one request.
   *
   * `GET /categories` does not return a count — `CategoryResponse` is
   * `{ id, name, color, createdAt, updatedAt }` and nothing more — and asking
   * `/categories/:id/tasks` per row is the N+1 this screen is explicitly not
   * allowed to issue. `/tasks/grouped` already returns every owned category
   * with its tasks folded in, so one call answers the whole column.
   *
   * The count earns its request on the delete confirm: "3 tasks will lose this
   * category" is a materially different decision from "0 tasks will", and
   * without it the dialog has to speak in the abstract.
   *
   * ponytail: `/tasks/grouped` caps at 500 JOINED rows server-side
   * (GROUPED_CAP in tasks.service.ts) and the response carries no truncation
   * flag, so past that a count silently reads low. Fine for a personal board;
   * if it ever bites, the fix belongs on the server as a real count column on
   * `GET /categories`, not as more requests from here.
   */
  counts: () =>
    queryOptions({
      queryKey: categoryKeys.counts(),
      queryFn: async () => {
        const groups = await api.get('/tasks/grouped')
        // The last group is the uncategorized bucket, whose `category` is null;
        // it has no row on this screen, so it drops out here rather than
        // needing a guard at the call site.
        return new Map(
          groups
            .filter((g) => g.category !== null)
            .map((g) => [g.category!.id, g.tasks.length] as const),
        )
      },
    }),
}
