import { useDraggable } from '@dnd-kit/core'
import type { TaskPriority } from '@/db/schema'
import { Pill } from '@/components/pill'
import { cn } from '@/lib/utils'

export interface BoardTask {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  categoryIds: string[]
  updatedAt: string | Date
}

/** Relative where it helps, absolute where it does not. */
function when(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  // Past a week, "37d ago" is arithmetic homework. Give the date.
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface TaskCardProps {
  task: BoardTask
  categoryNames: Map<string, string>
  onOpen: (id: string) => void
  /** Set on the copy rendered inside the DragOverlay, which must not drag itself. */
  isOverlay?: boolean
  /**
   * Set in the category view, where there is nothing to drag to: `/tasks/grouped`
   * has no move-to-category semantics and `categoryIds` replaces the whole set,
   * so a drop between category columns cannot mean one thing. A card that is
   * inert rather than draggable-but-ignored is the honest version — the drag
   * never starts instead of starting and quietly achieving nothing.
   */
  dragDisabled?: boolean
}

/**
 * Card anatomy from plan.md §14: title at full weight on its own line, then one
 * dense row of small meta underneath. Deliberately not the Slack Lists
 * treatment, which prints a "Priority" / "Category" label on every face and
 * spends roughly three times the height for the same information.
 *
 * The whole card is one button. A card with a clickable title inside a
 * clickable div gives keyboard users two stops for one destination, and screen
 * readers a nested-interactive warning.
 */
export function TaskCard({
  task,
  categoryNames,
  onOpen,
  isOverlay = false,
  dragDisabled = false,
}: TaskCardProps) {
  const names = task.categoryIds.map((id) => categoryNames.get(id)).filter(Boolean)

  // The overlay copy is a portal-rendered picture of the card. Registering it as
  // a draggable too would mean two draggables share one id.
  const inert = isOverlay || dragDisabled
  const draggable = useDraggable({ id: task.id, disabled: inert })
  const { attributes, listeners, setNodeRef, isDragging } = draggable

  return (
    <button
      ref={inert ? undefined : setNodeRef}
      type="button"
      onClick={() => onOpen(task.id)}
      // `attributes` carries role, tabIndex, and the aria-describedby that
      // points at dnd-kit's instructions — without it the keyboard sensor is
      // reachable but undocumented. Withheld when the card cannot drag, so a
      // screen reader is not told about a gesture that does nothing here.
      {...(inert ? {} : attributes)}
      {...(inert ? {} : listeners)}
      className={cn(
        'w-full rounded-md border border-border bg-card p-3 text-left shadow-xs transition-colors hover:border-ring/40',
        // The original stays in place but recedes, so the column keeps its shape
        // while the overlay moves. Hiding it entirely makes the board reflow
        // under the pointer, which is what makes some drags feel like they
        // "jump".
        isDragging && 'opacity-40',
        isOverlay && 'cursor-grabbing shadow-lg',
      )}
    >
      <h4 className="type-body font-medium text-card-foreground">{task.title}</h4>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Pill kind="priority" value={task.priority as TaskPriority} />
        {names.length > 0 ? (
          <span className="type-meta truncate text-muted-foreground">{names.join(' · ')}</span>
        ) : null}
        <span className="type-meta ml-auto font-mono text-muted-foreground">
          {when(task.updatedAt)}
        </span>
      </div>
    </button>
  )
}
