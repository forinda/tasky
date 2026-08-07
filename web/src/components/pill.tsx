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
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
}

/**
 * `Record<TaskPriority, …>` rather than a bare object: adding a status on the
 * server is then a compile error here, not a pill that silently renders
 * `undefined`. Callers that need to list every value read these keys instead of
 * importing the server's runtime enums — the web bundle stays free of server
 * code, and the exhaustiveness is still enforced.
 */
const LABELS = { priority: PRIORITY_LABELS, status: STATUS_LABELS }

/**
 * Colour is carried by a dot rather than a filled background: the board shows
 * dozens of these at once, and filled chips at that density read as confetti.
 */
const DOT: {
  priority: Record<TaskPriority, string>
  status: Record<TaskStatus, string>
} = {
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
}

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
  // Narrowed on the discriminant rather than indexed with a cast: a cast here
  // would let a wrong key through as `undefined` at runtime.
  const [label, dot] =
    kind === 'priority'
      ? [LABELS.priority[value], DOT.priority[value]]
      : [LABELS.status[value], DOT.status[value]]

  return (
    <span
      className={cn(
        'type-meta inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-foreground',
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', dot)} aria-hidden="true" />
      {label}
    </span>
  )
}
