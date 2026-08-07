import { type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { STATUSES } from '@/components/pill'

/**
 * One arrow press moves one column.
 *
 * dnd-kit's default keyboard coordinate getter nudges the pointer 25px per
 * press, which is right for a freeform canvas and wrong for a board: the
 * columns are ~300px apart, so reaching the next one takes a dozen presses and
 * eleven of them announce nothing new. A keyboard user would reasonably
 * conclude the feature is broken.
 *
 * Up and down are deliberately not handled. There is no ordering column in the
 * schema, so there is no within-column position to move to — offering the
 * gesture would imply a result that cannot be saved.
 */
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { droppableContainers, droppableRects, collisionRect } },
) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return undefined
  if (!collisionRect) return undefined

  event.preventDefault()

  // Column order is the status order, not DOM order or insertion order — the
  // board renders To do, In progress, Done and the arrows must follow that.
  const columns = STATUSES.map((status) => droppableContainers.get(status)).filter(
    (container): container is NonNullable<typeof container> => container !== undefined,
  )
  if (columns.length === 0) return undefined

  // Which column is the dragged card currently over? Compare against the
  // rects rather than tracking an index, so this stays correct when a column
  // is missing or the board re-renders mid-drag.
  const centreX = collisionRect.left + collisionRect.width / 2
  const currentIndex = columns.findIndex((container) => {
    const rect = droppableRects.get(container.id)
    return rect ? centreX >= rect.left && centreX <= rect.left + rect.width : false
  })

  const from = currentIndex === -1 ? 0 : currentIndex
  const delta = event.key === 'ArrowRight' ? 1 : -1
  // Clamp rather than wrap. Wrapping from Done back to To do would move a task
  // across the whole board on one keypress, which is never what was meant.
  const nextIndex = Math.min(columns.length - 1, Math.max(0, from + delta))
  if (nextIndex === from) return undefined

  const target = droppableRects.get(columns[nextIndex].id)
  if (!target) return undefined

  return {
    x: target.left + target.width / 2,
    // Keep the card near the top of the target column: that is where a dropped
    // card lands, so the preview should not imply otherwise.
    y: target.top + Math.min(target.height / 2, 60),
  }
}
