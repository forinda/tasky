import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { taskKeys } from '@/features/tasks/keys'
import { categoryKeys } from './keys'

export interface CreateCategoryInput {
  name: string
  /** Omitted, never `''` — the server's regex rejects an empty string. */
  color?: string
}

/**
 * Update is a partial patch server-side, but this screen only ever edits both
 * fields together in one form, so both are sent. Keeping them optional here
 * would type a distinction the UI does not make.
 */
export interface UpdateCategoryInput {
  id: string
  name: string
  color?: string
}

/**
 * Every category write invalidates the tasks cache as well as its own.
 *
 * Not defensive over-invalidation — the board genuinely reads category data it
 * does not own the key for. Cards render category NAMES from the list, the
 * filter bar lists categories, and a task's `categoryIds` still contains a
 * deleted category's id until the tasks themselves are refetched. Skipping the
 * task half leaves the board rendering a chip for a category that no longer
 * exists, which looks like a failed delete.
 */
function useInvalidateCategories() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: categoryKeys.all })
    void queryClient.invalidateQueries({ queryKey: taskKeys.all })
  }
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (body: CreateCategoryInput) => api.post('/categories', { body }),
    onSuccess: invalidate,
  })
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCategoryInput) =>
      api.put('/categories/:id', { params: { id }, body }),
    onSuccess: invalidate,
  })
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (id: string) => api.delete('/categories/:id', { params: { id } }),
    onSuccess: invalidate,
  })
}
