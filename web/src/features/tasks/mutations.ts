import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TaskPriority, TaskStatus } from '@/db/schema'
import { api } from '@/lib/api'
import { taskKeys } from './keys'

export interface CreateTaskInput {
  title: string
  description?: string
  priority?: TaskPriority
  status?: TaskStatus
  categoryIds?: string[]
}

/**
 * Not the same shape as create, and deliberately so — the server's two schemas
 * differ in exactly these ways:
 *
 *   - every field optional, but the patch must not be empty
 *   - `description: null` clears it; create has no null because there is
 *     nothing to clear yet
 *   - `categoryIds` present replaces the whole set, absent leaves it alone, so
 *     `[]` and omitted mean different things
 *
 * Collapsing them into one interface types away all three distinctions.
 */
export interface UpdateTaskPatch {
  title?: string
  description?: string | null
  priority?: TaskPriority
  status?: TaskStatus
  categoryIds?: string[]
}

/**
 * Every task mutation invalidates every column.
 *
 * Narrower invalidation is tempting and wrong: changing a status moves a task
 * between two columns, changing categories can drop it out of a filtered view
 * entirely, and a create lands wherever its status says. Working out which
 * columns are affected duplicates the server's filtering logic in the client,
 * where it can disagree with it. Three small refetches are cheaper than a board
 * that is quietly stale.
 */
function useInvalidateBoard() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: taskKeys.all })
}

export function useCreateTask() {
  const invalidate = useInvalidateBoard()
  return useMutation({
    mutationFn: (body: CreateTaskInput) => api.post('/tasks', { body }),
    onSuccess: invalidate,
  })
}

export function useUpdateTask() {
  const invalidate = useInvalidateBoard()
  return useMutation({
    // `categoryIds` replaces the whole set when present; omitting it leaves the
    // links alone. That is the server's contract — do not "helpfully" always
    // send it, or clearing categories becomes impossible to express.
    mutationFn: ({ id, ...body }: UpdateTaskPatch & { id: string }) =>
      api.put('/tasks/:id', { params: { id }, body }),
    onSuccess: invalidate,
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateBoard()
  return useMutation({
    mutationFn: (id: string) => api.delete('/tasks/:id', { params: { id } }),
    onSuccess: invalidate,
  })
}
