import type { TaskStatus } from '@/db/schema'

/**
 * The filter state the board can be in. Lives in the URL (see `useBoardFilters`)
 * and is part of the query key, because two different filter sets are two
 * different results — not one entry that flickers between them.
 */
export interface BoardFilters {
  priority?: string
  categoryId?: string
  q?: string
}

/**
 * Keys mirror endpoint paths, so an invalidation reads like the route it
 * affects. Keeping them in one place stops a typo from silently creating a
 * second cache entry that never invalidates.
 */
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  /** One column. The status is separate from the rest so a column can be
   *  invalidated on its own when a task moves out of it. */
  column: (status: TaskStatus, filters: BoardFilters) =>
    [...taskKeys.lists(), status, filters] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
}
