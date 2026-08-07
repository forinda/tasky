import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Combobox, type ComboboxItem } from '@/components/ui/combobox'
import { Pill, PRIORITIES, STATUSES } from '@/components/pill'
import { EmptyState } from '@/components/empty-state'

const DEMO_CATEGORIES: ComboboxItem[] = [
  { value: 'c1', label: 'Design system', description: '8 tasks' },
  { value: 'c2', label: 'Backend', description: '14 tasks' },
  { value: 'c3', label: 'Infrastructure', description: '2 tasks' },
  { value: 'c4', label: 'Archived', description: 'Read-only', disabled: true },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border border-t py-8">
      <h2 className="type-meta text-muted-foreground mb-4 font-mono uppercase tracking-wider">{title}</h2>
      {children}
    </section>
  )
}

/**
 * Every component, every state, one page. Its job is to make Stories 9-11 cheap
 * — an author can see what exists instead of inventing a fourth button variant —
 * and to make accessibility checkable in one place rather than eleven.
 *
 * Dev-only: the router drops this route (and therefore these imports) from the
 * production bundle.
 */
export function Gallery() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [category, setCategory] = useState<string | null>(null)

  return (
    <main className="bg-background text-foreground mx-auto max-w-3xl px-6 py-12">
      <h1 className="type-display">Components</h1>
      <p className="text-muted-foreground type-body mt-2">
        Everything Stories 9 to 11 build from. Tab through this page — every control must show a
        focus ring.
      </p>

      <Section title="Type">
        <div className="space-y-3">
          <p className="type-display">Ship it</p>
          <p className="type-title">Page and dialog titles</p>
          <p className="type-body">Body copy at 14px — the board runs on this.</p>
          <p className="type-meta text-muted-foreground">Meta: pills, timestamps, counts</p>
          <p className="font-mono type-meta">2026-08-07 · 14 tasks · 3 columns</p>
        </div>
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Add task</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="outline">Filter</Button>
          <Button variant="ghost">Dismiss</Button>
          <Button variant="destructive">Delete category</Button>
          <Button disabled>Saving</Button>
          <Button size="sm">Small</Button>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid max-w-sm gap-4">
          <div className="grid gap-1.5">
            {/* A real label, not a placeholder standing in for one: a placeholder
                disappears exactly when you most need to know what the field is. */}
            <Label htmlFor="gallery-title">Title</Label>
            <Input id="gallery-title" placeholder="Ship the board view" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gallery-priority">Priority</Label>
            <Select>
              <SelectTrigger id="gallery-priority">
                <SelectValue placeholder="Choose a priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gallery-category">Category</Label>
            <Combobox
              id="gallery-category"
              items={DEMO_CATEGORIES}
              value={category}
              onChange={setCategory}
              placeholder="Choose a category"
              searchPlaceholder="Search categories"
              emptyAction={
                <Button size="sm" variant="ghost">
                  Create category
                </Button>
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gallery-disabled">Disabled</Label>
            <Input id="gallery-disabled" disabled placeholder="Not editable" />
          </div>
        </div>
      </Section>

      <Section title="Pill">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((p) => (
              <Pill key={p} kind="priority" value={p} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Pill key={s} kind="status" value={s} />
            ))}
          </div>
          <p className="type-meta text-muted-foreground">
            Every pill carries its word. There is no prop that renders the dot alone.
          </p>
        </div>
      </Section>

      <Section title="EmptyState">
        <div className="grid gap-6 sm:grid-cols-2">
          <EmptyState
            title="Nothing here yet"
            guidance="Add your first task to this column."
            action={<Button size="sm">Add task</Button>}
          />
          <EmptyState
            variant="page"
            title="No categories"
            guidance="Categories group your tasks into board columns. Make one to get started."
            action={<Button>Create category</Button>}
          />
        </div>
      </Section>

      <Section title="Overlays">
        <div className="flex flex-wrap gap-3">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this category?</DialogTitle>
                <DialogDescription>
                  Tasks in it are kept and become uncategorized. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                  Keep it
                </Button>
                <Button variant="destructive" onClick={() => setDialogOpen(false)}>
                  Delete category
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Open sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Ship the board view</SheetTitle>
                <SheetDescription>Task detail opens here, not on its own route.</SheetDescription>
              </SheetHeader>
              <div className="flex gap-2 px-4">
                <Pill kind="priority" value="high" />
                <Pill kind="status" value="in_progress" />
              </div>
            </SheetContent>
          </Sheet>

          {/* The button says "Add task", so the toast says "Task added" — the
              vocabulary stays constant through the flow. */}
          <Button variant="ghost" onClick={() => toast.success('Task added')}>
            Fire a toast
          </Button>
        </div>
      </Section>

      <Section title="Loading">
        <div className="max-w-sm space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </div>
      </Section>
    </main>
  )
}
