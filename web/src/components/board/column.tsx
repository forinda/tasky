import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { PlusIcon } from 'lucide-react'
import type { TaskStatus } from '@/db/schema'
import { STATUS_LABELS } from '@/components/pill'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { TaskCard, type BoardTask } from './task-card'

const DOT: Record<TaskStatus, string> = {
  todo: 'bg-status-todo',
  in_progress: 'bg-status-progress',
  done: 'bg-status-done',
}

/** What an empty column should say, per status. An instruction, not a label. */
const EMPTY_GUIDANCE: Record<TaskStatus, string> = {
  todo: 'Add the first thing you need to do.',
  in_progress: 'Move a task here when you start it.',
  done: 'Finished work lands here.',
}

interface ColumnProps {
  status: TaskStatus
  tasks: BoardTask[]
  categoryNames: Map<string, string>
  isPending: boolean
  isError: boolean
  /** True when a filter is active — an empty column then means something else. */
  isFiltered: boolean
  onAdd: (status: TaskStatus) => void
  onOpen: (id: string) => void
  onClearFilters: () => void
}

export function Column({
  status,
  tasks,
  categoryNames,
  isPending,
  isError,
  isFiltered,
  onAdd,
  onOpen,
  onClearFilters,
}: ColumnProps) {
  // The whole column is the drop target, empty state included. A column you
  // cannot drop into once it is empty is a column you can never refill — which
  // is exactly the state Done starts in.
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    // A section per column, labelled, so the board is navigable by landmark
    // rather than as one undifferentiated pile of buttons.
    <section aria-labelledby={`col-${status}`} className="flex w-72 shrink-0 flex-col sm:w-auto">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn('size-1.5 shrink-0 rounded-full', DOT[status])} aria-hidden="true" />
        <h2 id={`col-${status}`} className="type-meta font-medium text-foreground">
          {STATUS_LABELS[status]}
        </h2>
        <span className="ml-auto font-mono type-meta text-muted-foreground">
          {isPending ? '–' : tasks.length}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAdd(status)}
          aria-label={`Add task to ${STATUS_LABELS[status]}`}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-col gap-2 rounded-lg transition-colors',
          // A ring rather than a fill: the cards keep their own surfaces, and a
          // tinted column behind them muddies every card's contrast at once.
          isOver && 'outline-2 outline-offset-4 outline-ring/60',
        )}
      >
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
        {isPending ? (
          // Three empty columns while loading is indistinguishable from a
          // first-run board — the "working app reads as broken" failure §14
          // names. Skeletons say "wait", an empty state says "you have nothing".
          <>
            <Skeleton className="h-[4.5rem] w-full" />
            <Skeleton className="h-[4.5rem] w-full" />
          </>
        ) : isError ? (
          <p role="alert" className="type-meta text-destructive">
            Could not load this column. Reload to try again.
          </p>
        ) : tasks.length === 0 ? (
          isFiltered ? (
            // Filtered-empty is NOT first-run empty. Telling someone to "add
            // their first task" when they have merely filtered everything out
            // reads as data loss.
            <EmptyState
              title="No matches"
              guidance="No tasks here match the current filters."
              action={
                <Button size="sm" variant="ghost" onClick={onClearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Nothing here yet"
              guidance={EMPTY_GUIDANCE[status]}
              action={
                <Button size="sm" variant="ghost" onClick={() => onAdd(status)}>
                  Add task
                </Button>
              }
            />
          )
        ) : (
          // The context needs EVERY card id in this column, in render order —
          // that ordering is what the drop handler reads to name the task the
          // card landed below.
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} categoryNames={categoryNames} onOpen={onOpen} />
          ))
        )}
        </SortableContext>
      </div>
    </section>
  )
}
