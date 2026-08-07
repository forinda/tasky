import type { TaskPriority, TaskStatus } from '@/db/schema'
import { Pill, STATUS_LABELS } from '@/components/pill'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface VignetteTask {
  readonly title: string
  readonly priority: TaskPriority
  readonly category: string
  readonly when: string
}

/**
 * Card anatomy from plan.md §14: title at full weight on its own line, then one
 * dense row of small meta underneath. Deliberately not the Slack Lists
 * treatment, which prints a "Priority" / "Category" label on every card face and
 * spends roughly three times the vertical space for the same information.
 */
function TaskCard({ task }: { task: VignetteTask }) {
  return (
    <article className="rounded-md border border-border bg-card p-3 shadow-xs">
      <h4 className="type-body font-medium text-card-foreground">{task.title}</h4>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Pill kind="priority" value={task.priority} />
        <span className="type-meta text-muted-foreground">{task.category}</span>
        <span className="type-meta font-mono text-muted-foreground">{task.when}</span>
      </div>
    </article>
  )
}

const COLUMNS: ReadonlyArray<{ status: TaskStatus; tasks: ReadonlyArray<VignetteTask> }> = [
  {
    status: 'todo',
    tasks: [
      { title: 'Draft the launch note', priority: 'medium', category: 'Marketing', when: 'Fri' },
      { title: 'Pick a pricing page layout', priority: 'low', category: 'Marketing', when: 'Next week' },
    ],
  },
  {
    status: 'in_progress',
    tasks: [
      { title: 'Rewrite the onboarding email', priority: 'high', category: 'Growth', when: 'Today' },
    ],
  },
  // The third column is empty on purpose. An empty column is the state every
  // board spends most of its life in, and the one most products hide.
  { status: 'done', tasks: [] },
]

const DOT: Record<TaskStatus, string> = {
  todo: 'bg-status-todo',
  in_progress: 'bg-status-progress',
  done: 'bg-status-done',
}

/**
 * Not a screenshot. The board is Story 11, and a mocked-up image would be stale
 * the moment it shipped — this is the real `Pill`, the real `EmptyState`, the
 * real card anatomy, so the page cannot drift from the product. It also doubles
 * as proof that the Story 8 components compose.
 *
 * Static by design: it is a picture made of components, so nothing here is
 * focusable and the tab order runs straight from the CTA to the next section.
 */
export function BoardVignette({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      style={style}
      className={cn(
        'grid grid-cols-3 gap-3 rounded-xl border border-border bg-background/60 p-3 shadow-lg backdrop-blur-sm sm:gap-4 sm:p-4',
        className,
      )}
    >
      {COLUMNS.map(({ status, tasks }) => (
        <section key={status} className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className={cn('size-1.5 shrink-0 rounded-full', DOT[status])} aria-hidden="true" />
            <h3 className="truncate type-meta font-medium text-foreground">
              {STATUS_LABELS[status]}
            </h3>
            <span className="ml-auto font-mono type-meta text-muted-foreground">
              {tasks.length}
            </span>
          </div>

          <div className="space-y-2">
            {tasks.length > 0 ? (
              tasks.map((task) => <TaskCard key={task.title} task={task} />)
            ) : (
              <EmptyState
                title="Nothing done yet"
                guidance="Finished work lands here."
                action={
                  <Button size="sm" variant="ghost" tabIndex={-1} aria-hidden="true">
                    Add task
                  </Button>
                }
              />
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
