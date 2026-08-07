import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { BoardFilters } from './keys'

/**
 * Filter state lives in the URL, not in component state.
 *
 * A filtered board should survive a reload and be shareable — "look at this
 * link" is most of what a filter is for. State that evaporates on refresh is a
 * worse answer than no filter at all, because the user cannot tell whether the
 * board reset or their data changed.
 */
export function useBoardFilters() {
  const [params, setParams] = useSearchParams()

  const filters: BoardFilters = useMemo(
    () => ({
      priority: params.get('priority') ?? undefined,
      categoryId: params.get('category') ?? undefined,
      q: params.get('q') ?? undefined,
    }),
    [params],
  )

  const setFilter = useCallback(
    (key: 'priority' | 'category' | 'q', value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        // Replace, not push: a filter change is a change of view, not a
        // navigation. Pushing makes Back walk through every chip the user
        // toggled instead of leaving the board.
        { replace: true },
      )
    },
    [setParams],
  )

  const clearAll = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams])

  const activeCount = Object.values(filters).filter(Boolean).length

  return { filters, setFilter, clearAll, activeCount, isFiltered: activeCount > 0 }
}
