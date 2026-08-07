import type { TaskPriority } from '@/db/schema'
import { Pill } from '@/components/pill'

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
export function TaskCard({ task, categoryNames, onOpen }: TaskCardProps) {
  const names = task.categoryIds.map((id) => categoryNames.get(id)).filter(Boolean)

  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="w-full rounded-md border border-border bg-card p-3 text-left shadow-xs transition-colors hover:border-ring/40"
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
