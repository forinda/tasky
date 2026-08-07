import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { BoardCategory } from '@/features/tasks/queries'
import { cn } from '@/lib/utils'
import { TaskCard, type BoardTask } from './task-card'

interface CategoryColumnProps {
  /** `null` is the uncategorized bucket the server always sends last. */
  category: BoardCategory | null
  tasks: BoardTask[]
  categoryNames: Map<string, string>
  isPending: boolean
  /** True when a filter is active — an empty column then means something else. */
  isFiltered: boolean
  onOpen: (id: string) => void
  onClearFilters: () => void
}

/**
 * One column of the category board.
 *
 * Not a variant of `Column`: that one is a drop target keyed by status, with a
 * per-column "add" that seeds the new task's status. Neither has a meaning here
 * — see `dragDisabled` on TaskCard — so the shared part is the card and the
 * empty state, which is exactly what this reuses.
 */
export function CategoryColumn({
  category,
  tasks,
  categoryNames,
  isPending,
  isFiltered,
  onOpen,
  onClearFilters,
}: CategoryColumnProps) {
  const name = category?.name ?? 'Uncategorized'
  const id = category?.id ?? 'uncategorized'

  return (
    // A fixed width at every breakpoint, unlike the status column: these are a
    // strip of N, not a grid of three, and a column that narrows as categories
    // are added would squeeze the cards down with it.
    <section aria-labelledby={`cat-${id}`} className="flex w-72 shrink-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        {/* A category's own stored colour, the one place the board renders a
            colour it did not choose. A category without one gets the muted
            token rather than an invented hue. */}
        <span
          className={cn('size-1.5 shrink-0 rounded-full', !category?.color && 'bg-muted-foreground/40')}
          style={category?.color ? { backgroundColor: category.color } : undefined}
          aria-hidden="true"
        />
        <h2 id={`cat-${id}`} className="type-meta truncate font-medium text-foreground">
          {name}
        </h2>
        <span className="ml-auto font-mono type-meta text-muted-foreground">
          {isPending ? '–' : tasks.length}
        </span>
      </div>

      <div className="flex min-h-24 flex-col gap-2">
        {isPending ? (
          <>
            <Skeleton className="h-[4.5rem] w-full" />
            <Skeleton className="h-[4.5rem] w-full" />
          </>
        ) : tasks.length === 0 ? (
          isFiltered ? (
            <EmptyState
              title="No matches"
              guidance={`Nothing in ${name} matches the current filters.`}
              action={
                <Button size="sm" variant="ghost" onClick={onClearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            // An empty category still gets a column: one that vanished when
            // emptied would hide that the category exists at all.
            <EmptyState
              title={category ? 'No tasks yet' : 'Nothing loose'}
              guidance={
                category
                  ? `Open a task and add it to ${name}.`
                  : 'Every task belongs to at least one category.'
              }
            />
          )
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              categoryNames={categoryNames}
              onOpen={onOpen}
              dragDisabled
            />
          ))
        )}
      </div>
    </section>
  )
}
