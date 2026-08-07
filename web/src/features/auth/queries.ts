import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { authKeys } from './keys'

/**
 * The data type is inferred from the server's route types — never annotated.
 * If a call here ever needs a manual annotation, that is the signal that
 * `kick typegen` is stale, not that the type is missing.
 */
export const authQueries = {
  me: () =>
    queryOptions({
      queryKey: authKeys.me(),
      queryFn: () => api.get('/auth/me'),
      // A 401 here means "not signed in", which is an answer, not a failure.
      retry: false,
    }),
}
