import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Link } from 'react-router'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { TaskStatus } from '@/db/schema'
import { STATUSES } from '@/components/pill'
import { Wordmark } from '@/components/landing/wordmark'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { CategoryColumn } from '@/components/board/category-column'
import { Column } from '@/components/board/column'
import { FilterBar } from '@/components/board/filter-bar'
import { TaskSheet } from '@/components/board/task-sheet'
import { TaskCard, type BoardTask } from '@/components/board/task-card'
import { buildAnnouncements, screenReaderInstructions } from '@/components/board/announcements'
import { boardKeyboardCoordinates } from '@/components/board/keyboard-coordinates'
import { useLogout } from '@/features/auth/mutations'
import { useMoveTask } from '@/features/tasks/mutations'
import { categoryQueries } from '@/features/categories/queries'
import { taskQueries, type BoardCategory, type GroupedColumn } from '@/features/tasks/queries'
import { useBoardFilters } from '@/features/tasks/use-board-filters'
import type { BoardView } from '@/features/tasks/keys'
import { useReducedMotion } from '@/lib/use-reduced-motion'

/** What the sheet is doing: closed, creating into a column, or editing one task. */
type SheetState = { mode: 'closed' } | { mode: 'create'; status: TaskStatus } | { mode: 'edit'; id: string }

const VIEW_LABELS: Record<BoardView, string> = { status: 'By status', category: 'By category' }

/**
 * Two views of the same tasks, so a segmented pair of pressed-state buttons
 * rather than a link or a checkbox — nothing here navigates, and neither option
 * is "off".
 */
function ViewToggle({ view, onChange }: { view: BoardView; onChange: (next: BoardView) => void }) {
  return (
    <div role="group" aria-label="Group the board by" className="flex rounded-md border border-border p-0.5">
      {(Object.keys(VIEW_LABELS) as BoardView[]).map((value) => (
        <Button
          key={value}
          size="sm"
          variant={view === value ? 'secondary' : 'ghost'}
          aria-pressed={view === value}
          onClick={() => onChange(value)}
        >
          {VIEW_LABELS[value]}
        </Button>
      ))}
    </div>
  )
}

export function Board() {
  const logout = useLogout()
  const { filters, setFilter, clearAll, isFiltered, view, setView } = useBoardFilters()
  const [sheet, setSheet] = useState<SheetState>({ mode: 'closed' })

  const categories = useQuery(categoryQueries.list())
  const categoryList = (categories.data?.data ?? []) as BoardCategory[]
  const categoryNames = new Map(categoryList.map((c) => [c.id, c.name]))

  // One query per column. See queries.ts for why this is not one list split in
  // the browser. Only the visible view fetches — the other one keeps whatever it
  // last had, so toggling back is instant and neither view pays for the other.
  const columns = useQueries({
    queries: STATUSES.map((status) => ({
      ...taskQueries.column(status, filters),
      enabled: view === 'status',
    })),
  })

  // The whole category board in one request: /tasks/grouped is not paginated and
  // takes no query parameters, so there is nothing to split per column.
  const grouped = useQuery({ ...taskQueries.grouped(filters), enabled: view === 'category' })

  // While the board loads, the columns are drawn from the category list, which
  // is already cached for the filter bar. Skeletons under the real headings say
  // "wait"; a bare screen would say "you have no categories".
  const categoryColumns: GroupedColumn[] = grouped.data?.columns ?? [
    ...categoryList.map((category) => ({ category, tasks: [] })),
    { category: null, tasks: [] },
  ]

  const reducedMotion = useReducedMotion()
  const moveTask = useMoveTask()
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const allTasks = columns.flatMap((q) => (q?.data?.data ?? []) as BoardTask[])
  const draggingTask = allTasks.find((t) => t.id === draggingId) ?? null

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Without a distance, every click on a card starts a micro-drag and the
      // card never opens its sheet — the classic "drag broke my click" bug.
      // 6px is far enough to exclude a shaky click and short enough that a
      // deliberate drag still feels immediate.
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      // A delay, not a distance, on touch. Story 11 made the columns scroll
      // sideways inside their own container; a distance constraint cannot tell
      // a drag from the start of a scroll, so the two fight and the board
      // becomes hard to scroll on a phone. Holding still for 200ms is
      // unambiguous.
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  )

  const announcements = buildAnnouncements(
    (id) => allTasks.find((t) => t.id === id)?.title ?? 'task',
  )

  function onDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id))
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggingId(null)

    const taskId = String(event.active.id)
    const target = event.over?.id
    if (!target) return

    const nextStatus = String(target) as TaskStatus
    const task = allTasks.find((t) => t.id === taskId)
    // Dropping a card back where it started is not a change. Issuing the write
    // anyway would bump updatedAt and reorder the column for nothing.
    if (!task || task.status === nextStatus) return

    moveTask.mutate({ id: taskId, status: nextStatus, from: task.status as TaskStatus, filters })
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/categories">Categories</Link>
          </Button>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">Board</h1>
          <div className="flex items-center gap-2">
            <ViewToggle view={view} onChange={setView} />
            <Button size="sm" onClick={() => setSheet({ mode: 'create', status: 'todo' })}>
              Add task
            </Button>
          </div>
        </div>

        <FilterBar
          filters={filters}
          categories={(categories.data?.data ?? []) as Array<{ id: string; name: string }>}
          onChange={setFilter}
          onClearAll={clearAll}
        />

        {view === 'category' ? (
          <>
            {/* Said once, up front, rather than discovered by trying: the
                grouped endpoint has no move-to-category operation, and
                `categoryIds` replaces a task's whole set, so a drop between two
                category columns has no single meaning to send. Editing the set
                in the sheet is the operation that does exist. */}
            <p className="mt-4 type-meta text-muted-foreground">
              Grouped by category. Cards do not drag here — a task can sit in several categories at
              once, so a drop has no single meaning. Open a card to change its categories.
            </p>

            {grouped.data?.truncated ? (
              // The cap counts JOINED rows, so a task in three categories spends
              // three of them. Saying "500 tasks" would be a smaller number than
              // the truth and would send someone counting their tasks in vain.
              <p
                role="status"
                className="mt-4 rounded-md border border-border bg-card px-3 py-2 type-meta text-foreground"
              >
                This view is capped at 500 task–category links and your board has reached it, so the
                newest cards are missing from these columns. The cap is on the server and filtering
                here will not bring them back — the status board is unaffected.
              </p>
            ) : null}

            {grouped.isError ? (
              <p role="alert" className="mt-6 type-meta text-destructive">
                Could not load the category board. Reload to try again.
              </p>
            ) : (
              // Always a scrolling strip, unlike the three-column status board:
              // the number of categories is the user's business, not a number
              // that fits a grid. The page itself never scrolls sideways.
              <div className="mt-6 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                <div className="flex gap-4">
                  {categoryColumns.map(({ category, tasks }) => (
                    <CategoryColumn
                      key={category?.id ?? 'uncategorized'}
                      category={category}
                      tasks={tasks}
                      categoryNames={categoryNames}
                      isPending={grouped.isPending}
                      isFiltered={isFiltered}
                      onOpen={(id) => setSheet({ mode: 'edit', id })}
                      onClearFilters={clearAll}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDraggingId(null)}
            accessibility={{ announcements, screenReaderInstructions }}
          >
            {/* The columns scroll sideways inside this container on narrow screens.
                The page itself must never scroll horizontally — that rule is
                checked at 320px in every story. */}
            <div className="mt-6 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:overflow-visible sm:px-0">
              <div className="flex gap-4 sm:grid sm:grid-cols-3">
                {STATUSES.map((status, index) => {
                  const query = columns[index]
                  return (
                    <Column
                      key={status}
                      status={status}
                      tasks={(query?.data?.data ?? []) as BoardTask[]}
                      categoryNames={categoryNames}
                      isPending={query?.isPending ?? true}
                      isError={query?.isError ?? false}
                      isFiltered={isFiltered}
                      onAdd={(s) => setSheet({ mode: 'create', status: s })}
                      onOpen={(id) => setSheet({ mode: 'edit', id })}
                      onClearFilters={clearAll}
                    />
                  )
                })}
              </div>
            </div>

            {/* The dragged card is rendered here, in a portal, so it is not
                clipped by the column's scroll container — dragging out of a
                scrollable strip otherwise cuts the card in half at the edge. */}
            {/* `null` disables the drop animation outright rather than shortening
                it. A 10ms flight is still movement, and the request was for none. */}
            <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
              {draggingTask ? (
                <TaskCard
                  isOverlay
                  task={draggingTask}
                  categoryNames={categoryNames}
                  onOpen={() => {}}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      <TaskSheet
        state={sheet}
        categories={(categories.data?.data ?? []) as Array<{ id: string; name: string }>}
        onClose={() => setSheet({ mode: 'closed' })}
      />
    </div>
  )
}
