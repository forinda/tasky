import type { TaskPriority, TaskStatus } from '@/db/schema'
import { cn } from '@/lib/utils'

/**
 * A discriminated union, so `<Pill kind="priority" value="done" />` does not
 * compile. The value types come from the server's schema, so adding a status
 * there surfaces here as a type error rather than a silently unstyled pill.
 */
type PillProps =
  | { kind: 'priority'; value: TaskPriority; className?: string }
  | { kind: 'status'; value: TaskStatus; className?: string }

/**
 * The wire format is not the display format, and the mapping lives here rather
 * than at every call site — otherwise `in_progress` leaks into the UI the one
 * time someone forgets.
 */
const LABELS = {
  priority: { low: 'Low', medium: 'Medium', high: 'High' },
  status: { todo: 'To do', in_progress: 'In progress', done: 'Done' },
} as const

/**
 * Colour is carried by a dot rather than a filled background: the board shows
 * dozens of these at once, and filled chips at that density read as confetti.
 */
const DOT = {
  priority: {
    low: 'bg-priority-low',
    medium: 'bg-priority-medium',
    high: 'bg-priority-high',
  },
  status: {
    todo: 'bg-status-todo',
    in_progress: 'bg-status-progress',
    done: 'bg-status-done',
  },
} as const

/**
 * Priority and status, the most-repeated atom in the product — it appears on
 * every card, so it has to read at a glance without dominating.
 *
 * The word is always rendered. That is structural, not a convention someone can
 * forget: there is no prop that produces the dot alone. Roughly one in twelve
 * men has some colour vision deficiency, and it is also what keeps sky
 * `in_progress` distinguishable from the violet brand at 12px.
 */
export function Pill({ kind, value, className }: PillProps) {
  const label = LABELS[kind][value as keyof (typeof LABELS)[typeof kind]]
  const dot = DOT[kind][value as keyof (typeof DOT)[typeof kind]]

  return (
    <span
      className={cn(
        'text-meta inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-ink',
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', dot)} aria-hidden="true" />
      {label}
    </span>
  )
}
