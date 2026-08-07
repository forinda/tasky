import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { categoryKeys } from './keys'

/**
 * Read-only in this story. The board filters by category and shows category
 * names on cards; creating and renaming them is its own screen.
 */
export const categoryQueries = {
  list: () =>
    queryOptions({
      queryKey: categoryKeys.list(),
      queryFn: () => api.get('/categories', { query: { limit: 100 } }),
    }),
}
