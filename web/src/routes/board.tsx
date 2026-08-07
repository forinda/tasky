import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { TaskStatus } from '@/db/schema'
import { STATUSES } from '@/components/pill'
import { Wordmark } from '@/components/landing/wordmark'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Column } from '@/components/board/column'
import { FilterBar } from '@/components/board/filter-bar'
import { TaskSheet } from '@/components/board/task-sheet'
import type { BoardTask } from '@/components/board/task-card'
import { useLogout } from '@/features/auth/mutations'
import { categoryQueries } from '@/features/categories/queries'
import { taskQueries } from '@/features/tasks/queries'
import { useBoardFilters } from '@/features/tasks/use-board-filters'

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
      </main>

      <TaskSheet
        state={sheet}
        categories={(categories.data?.data ?? []) as Array<{ id: string; name: string }>}
        onClose={() => setSheet({ mode: 'closed' })}
      />
    </div>
  )
}
