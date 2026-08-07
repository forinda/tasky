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
import { useQueries, useQuery } from '@tanstack/react-query'
import type { TaskStatus } from '@/db/schema'
import { STATUSES } from '@/components/pill'
import { Wordmark } from '@/components/landing/wordmark'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Column } from '@/components/board/column'
import { FilterBar } from '@/components/board/filter-bar'
import { TaskSheet } from '@/components/board/task-sheet'
import { TaskCard, type BoardTask } from '@/components/board/task-card'
import { buildAnnouncements, screenReaderInstructions } from '@/components/board/announcements'
import { boardKeyboardCoordinates } from '@/components/board/keyboard-coordinates'
import { useLogout } from '@/features/auth/mutations'
import { useMoveTask } from '@/features/tasks/mutations'
import { categoryQueries } from '@/features/categories/queries'
import { taskQueries } from '@/features/tasks/queries'
import { useBoardFilters } from '@/features/tasks/use-board-filters'
import { useReducedMotion } from '@/lib/use-reduced-motion'

/** What the sheet is doing: closed, creating into a column, or editing one task. */
type SheetState = { mode: 'closed' } | { mode: 'create'; status: TaskStatus } | { mode: 'edit'; id: string }

export function Board() {
  const logout = useLogout()
  const { filters, setFilter, clearAll, isFiltered } = useBoardFilters()
  const [sheet, setSheet] = useState<SheetState>({ mode: 'closed' })

  const categories = useQuery(categoryQueries.list())
  const categoryNames = new Map(
    (categories.data?.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
  )

  // One query per column. See queries.ts for why this is not one list split in
  // the browser.
  const columns = useQueries({
    queries: STATUSES.map((status) => taskQueries.column(status, filters)),
  })

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
          <Button size="sm" onClick={() => setSheet({ mode: 'create', status: 'todo' })}>
            Add task
          </Button>
        </div>

        <FilterBar
          filters={filters}
          categories={(categories.data?.data ?? []) as Array<{ id: string; name: string }>}
          onChange={setFilter}
          onClearAll={clearAll}
        />

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
      </main>

      <TaskSheet
        state={sheet}
        categories={(categories.data?.data ?? []) as Array<{ id: string; name: string }>}
        onClose={() => setSheet({ mode: 'closed' })}
      />
    </div>
  )
}
