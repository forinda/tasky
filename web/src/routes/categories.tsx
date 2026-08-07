import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '@/components/empty-state'
import { Wordmark } from '@/components/landing/wordmark'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryForm } from '@/components/categories/category-form'
import { CategoryRow, type CategoryListItem } from '@/components/categories/category-row'
import { deleteBlurb } from '@/components/categories/labels'
import { DEFAULT_SWATCH } from '@/components/categories/swatches'
import { categoryQueries } from '@/features/categories/queries'
import { useCreateCategory, useDeleteCategory } from '@/features/categories/mutations'

export function Categories() {
  const categories = useQuery(categoryQueries.list())
  const counts = useQuery(categoryQueries.counts())

  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // The whole row, not just an id: the confirm needs the name, and reading it
  // back out of a list that the delete is about to change is a race with itself.
  const [deleting, setDeleting] = useState<CategoryListItem | null>(null)

  const create = useCreateCategory()
  const remove = useDeleteCategory()

  const items = categories.data?.data ?? []

  function closeCreate() {
    create.reset()
    setCreating(false)
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app">Board</Link>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-6 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">Categories</h1>
          {/* Hidden while the create row is open — two ways to open one form,
              one of which does nothing, is a button that looks broken. */}
          {items.length > 0 && !creating ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              New category
            </Button>
          ) : null}
        </div>

        <p className="type-body mt-2 text-muted-foreground">
          Categories label your tasks. A task can carry several, and deleting one never deletes
          the tasks inside it.
        </p>

        <div className="mt-6">
          {categories.isPending ? (
            <div className="grid gap-2" aria-hidden>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : categories.isError ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <p className="type-body text-muted-foreground">
                Could not load your categories.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => void categories.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : items.length === 0 && !creating ? (
            <EmptyState
              variant="page"
              title="No categories yet"
              guidance="Create one to group your tasks — “Work”, “Home”, anything you sort by."
              action={<Button onClick={() => setCreating(true)}>New category</Button>}
            />
          ) : (
            <ul className="rounded-lg border border-border bg-card">
              {items.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  taskCount={counts.data?.get(category.id)}
                  isEditing={editingId === category.id}
                  onEdit={() => setEditingId(category.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => setDeleting(category)}
                />
              ))}

              {/* Inline create: the last row of the same list becomes the form,
                  so a new category appears where it will actually live. */}
              {creating ? (
                <li className="border-t border-border p-4 first:border-t-0">
                  <CategoryForm
                    initialColor={DEFAULT_SWATCH}
                    submitLabel="Add category"
                    pending={create.isPending}
                    error={create.error}
                    onCancel={closeCreate}
                    onSubmit={({ name, color }) =>
                      create.mutate({ name, color }, { onSuccess: closeCreate })
                    }
                  />
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </main>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            remove.reset()
            setDeleting(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              {deleting ? deleteBlurb(deleting.name, counts.data?.get(deleting.id)) : null}
            </DialogDescription>
          </DialogHeader>
          {remove.isError ? (
            <p role="alert" className="type-meta text-destructive">
              Could not delete that category. Try again.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={remove.isPending}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (!deleting) return
                remove.mutate(deleting.id, {
                  onSuccess: () => {
                    // A row being renamed that is then deleted would leave the
                    // editor open against an id the server no longer has.
                    if (editingId === deleting.id) setEditingId(null)
                    setDeleting(null)
                  },
                })
              }}
            >
              {remove.isPending ? 'Deleting…' : 'Delete category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
