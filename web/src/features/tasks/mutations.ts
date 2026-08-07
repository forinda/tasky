import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TaskPriority, TaskStatus } from '@/db/schema'
import { api } from '@/lib/api'
import { taskKeys, type BoardFilters } from './keys'

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

interface MoveInput {
  id: string
  status: TaskStatus
  /** Where it came from, so a rollback knows where to put it back. */
  from: TaskStatus
  /**
   * The task this one lands directly BELOW; `null` is the top of the column.
   *
   * An id, never an index or a position float. An index would be read against
   * a list the server may already have changed, and a float would make the
   * client race anyone else's move — with an id the server picks the midpoint
   * itself, and rebalances when there is no room left between neighbours.
   */
  afterId: string | null
  filters: BoardFilters
}

interface MoveContext {
  previous: Array<[readonly unknown[], unknown]>
}

/**
 * Moving a card between columns, optimistically.
 *
 * This is the one mutation that needs it. Every other write happens behind a
 * sheet the user has to dismiss, so the refetch lands before they see the
 * board again. A drag ends with their finger still on the card: if it sits in
 * the old column until the request returns and then jumps, that reads as a
 * failed drop even when the write succeeded.
 */
export function useMoveTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status, afterId }: MoveInput) =>
      // The position endpoint, not PUT /tasks/:id. PUT moves a task to another
      // column but always lands it at the top; this one places it exactly where
      // it was dropped, and is a single row update because positions are
      // fractional.
      api.patch('/tasks/:id/position', { params: { id }, body: { status, afterId } }),

    onMutate: async ({ id, status, from, afterId, filters }): Promise<MoveContext> => {
      // Cancel first. A refetch that started before this mutation can land
      // after it and overwrite the optimistic move with pre-move data — the
      // card would visibly snap back for no reason a user could explain.
      await queryClient.cancelQueries({ queryKey: taskKeys.all })

      const fromKey = taskKeys.column(from, filters)
      const toKey = taskKeys.column(status, filters)
      const previous: MoveContext['previous'] = [
        [fromKey, queryClient.getQueryData(fromKey)],
        [toKey, queryClient.getQueryData(toKey)],
      ]

      const source = queryClient.getQueryData(fromKey) as
        | { data: Array<{ id: string; status: string }>; meta?: unknown }
        | undefined
      const moved = source?.data.find((t) => t.id === id)

      if (source && moved) {
        queryClient.setQueryData(fromKey, {
          ...source,
          data: source.data.filter((t) => t.id !== id),
        })
        queryClient.setQueryData(toKey, (current: typeof source | undefined) => {
          if (!current) return current
          // Insert where it was actually dropped, not at the top. Prepending
          // would show the card in one place for as long as the request takes
          // and then jump it to another — which reads as the drop having gone
          // wrong even though it succeeded.
          const rest = current.data.filter((t) => t.id !== id)
          const anchor = afterId === null ? -1 : rest.findIndex((t) => t.id === afterId)
          const at = anchor + 1
          return { ...current, data: [...rest.slice(0, at), { ...moved, status }, ...rest.slice(at)] }
        })
      }

      return { previous }
    },

    onError: (_error, _vars, context) => {
      // Put it back where it was. A silent revert is indistinguishable from a
      // drop that never registered, so the caller also surfaces a message.
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data)
      }
    },

    // The optimistic value is a guess about what the server will say, never a
    // replacement for asking. Settled, not success: a failed move still needs
    // the truth refetched, because the rollback above is itself a guess.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateBoard()
  return useMutation({
    mutationFn: (id: string) => api.delete('/tasks/:id', { params: { id } }),
    onSuccess: invalidate,
  })
}
