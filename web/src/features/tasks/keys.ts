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
 * How the board is grouped. Also in the URL — a view that resets on reload is
 * worse than no toggle, and "look at this board" has to survive being pasted.
 */
export type BoardView = 'status' | 'category'

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
  /**
   * The whole category board in one entry — `/tasks/grouped` returns every
   * column at once. The 'grouped' segment is what keeps it out of the status
   * board's entries: without it the two views would share a cache slot and
   * flicker between each other's shapes on every toggle.
   *
   * Filters are part of the key even though the endpoint takes none, because
   * the entry holds the filtered result (see queries.ts) and a key that does
   * not describe its value is a stale read waiting to happen.
   */
  grouped: (filters: BoardFilters) => [...taskKeys.all, 'grouped', filters] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
}
