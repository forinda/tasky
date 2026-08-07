import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { BoardFilters, BoardView } from './keys'

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

  /**
   * Anything that is not exactly `category` is the status board. An unknown
   * value in a hand-edited URL then degrades to the default view rather than to
   * a blank screen.
   */
  const view: BoardView = params.get('view') === 'category' ? 'category' : 'status'

  const setView = useCallback(
    (next: BoardView) => {
      setParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          // The default view is the absence of the parameter, so a plain /board
          // link and a toggled-back one are the same URL.
          if (next === 'category') params.set('view', next)
          else params.delete('view')
          return params
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // Clearing filters keeps the view. They are both in the URL but only one of
  // them is a filter: dropping the user back onto the status board because they
  // dismissed a chip is a navigation they did not ask for.
  const clearAll = useCallback(
    () =>
      setParams(
        (prev) => {
          const kept = new URLSearchParams()
          const currentView = prev.get('view')
          if (currentView) kept.set('view', currentView)
          return kept
        },
        { replace: true },
      ),
    [setParams],
  )

  const activeCount = Object.values(filters).filter(Boolean).length

  return { filters, setFilter, clearAll, activeCount, isFiltered: activeCount > 0, view, setView }
}
