import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core'
import type { TaskStatus } from '@/db/schema'
import { STATUS_LABELS } from '@/components/pill'

/**
 * dnd-kit's defaults describe coordinates — "moved to position 2". On a board
 * that is nearly useless: the question a screen-reader user has is *which
 * column*, and position within a column is not even persistable here (there is
 * no ordering column in the schema).
 *
 * These name the task and the column instead. They are the entire feedback
 * channel for a keyboard drag, since the visual overlay says nothing to someone
 * who cannot see it.
 */
export function buildAnnouncements(titleOf: (id: string) => string): Announcements {
  const columnOf = (id: string | undefined) =>
    id && id in STATUS_LABELS ? STATUS_LABELS[id as TaskStatus] : null

  return {
    onDragStart: ({ active }) => `Picked up ${titleOf(String(active.id))}.`,

    onDragOver: ({ active, over }) => {
      const column = columnOf(over?.id ? String(over.id) : undefined)
      return column
        ? `${titleOf(String(active.id))} is over ${column}.`
        : `${titleOf(String(active.id))} is not over a column.`
    },

    onDragEnd: ({ active, over }) => {
      const column = columnOf(over?.id ? String(over.id) : undefined)
      return column
        ? `Moved ${titleOf(String(active.id))} to ${column}.`
        : // Dropping outside a column is a no-op, and silence would leave the
          // user unsure whether it moved.
          `${titleOf(String(active.id))} was dropped outside a column and stayed where it was.`
    },

    onDragCancel: ({ active }) =>
      `Cancelled. ${titleOf(String(active.id))} stayed where it was.`,
  }
}

/**
 * Read once when a draggable receives focus. Says which keys do what, because a
 * keyboard affordance nobody is told about does not exist.
 */
export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'Press Space to pick up this task. Use the left and right arrow keys to move it between columns. Press Space again to drop it, or Escape to cancel.',
}
