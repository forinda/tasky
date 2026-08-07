import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TaskPriority, TaskStatus } from '@/db/schema'
import { PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS } from '@/components/pill'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { api } from '@/lib/api'
import { taskKeys } from '@/features/tasks/keys'
import { useCreateTask, useDeleteTask, useUpdateTask } from '@/features/tasks/mutations'

type SheetState =
  | { mode: 'closed' }
  | { mode: 'create'; status: TaskStatus }
  | { mode: 'edit'; id: string }

interface TaskSheetProps {
  state: SheetState
  categories: Array<{ id: string; name: string }>
  onClose: () => void
}

interface FormValues {
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  categoryIds: string[]
}

const BLANK: FormValues = {
  title: '',
  description: '',
  priority: 'medium',
  status: 'todo',
  categoryIds: [],
}

/**
 * A sheet, not a route — plan.md §14 is explicit. Focus trapping, Escape, and
 * return-focus were verified on this primitive in Story 8; nothing here rebuilds
 * them.
 *
 * Create and edit share one form. Two near-identical forms drift apart within a
 * story or two, and then only one of them gets the next fix.
 */
export function TaskSheet({ state, categories, onClose }: TaskSheetProps) {
  const isOpen = state.mode !== 'closed'
  const editingId = state.mode === 'edit' ? state.id : null

  const create = useCreateTask()
  const update = useUpdateTask()
  const remove = useDeleteTask()

  const [values, setValues] = useState<FormValues>(BLANK)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const existing = useQuery({
    queryKey: taskKeys.detail(editingId ?? ''),
    queryFn: () => api.get('/tasks/:id', { params: { id: editingId! } }),
    enabled: editingId !== null,
  })

  // Seed the form when the sheet opens, and reset it when it closes — a stale
  // title left in state reappears the next time the sheet opens for a different
  // task, which looks like the wrong task loaded.
  useEffect(() => {
    if (state.mode === 'create') setValues({ ...BLANK, status: state.status })
    if (state.mode === 'closed') setValues(BLANK)
  }, [state.mode, state.mode === 'create' ? state.status : null])

  useEffect(() => {
    if (state.mode !== 'edit' || !existing.data) return
    const task = existing.data
    setValues({
      title: task.title,
      description: task.description ?? '',
      priority: task.priority as TaskPriority,
      status: task.status as TaskStatus,
      categoryIds: task.categoryIds,
    })
  }, [state.mode, existing.data])

  const pending = create.isPending || update.isPending || remove.isPending

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (state.mode === 'create') {
      create.mutate(
        {
          title: values.title,
          // Omit rather than send an empty string: the field is optional, and
          // "" is a value that would overwrite nothing with nothing.
          ...(values.description ? { description: values.description } : {}),
          priority: values.priority,
          status: values.status,
          categoryIds: values.categoryIds,
        },
        { onSuccess: onClose },
      )
      return
    }
    if (state.mode === 'edit') {
      update.mutate(
        {
          id: state.id,
          title: values.title,
          // `null` clears it on update, where "" would be a 0-length string.
          description: values.description || null,
          priority: values.priority,
          status: values.status,
          categoryIds: values.categoryIds,
        },
        { onSuccess: onClose },
      )
    }
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="flex flex-col gap-0 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{state.mode === 'edit' ? 'Task' : 'New task'}</SheetTitle>
            <SheetDescription>
              {state.mode === 'edit'
                ? 'Changes save when you press Save.'
                : 'Give it a title. Everything else can wait.'}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={onSubmit} className="grid gap-4 px-4 pb-4">
            <div className="grid gap-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                required
                value={values.title}
                onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="task-description">Description</Label>
              <textarea
                id="task-description"
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="task-status">Status</Label>
              {/* Until Story 12 adds drag, this select IS how a task moves
                  between columns — the board has to be fully usable without it. */}
              <Combobox
                id="task-status"
                items={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
                value={values.status}
                onChange={(value) =>
                  setValues((v) => ({ ...v, status: (value as TaskStatus) ?? v.status }))
                }
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <Combobox
                id="task-priority"
                items={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
                value={values.priority}
                onChange={(value) =>
                  setValues((v) => ({ ...v, priority: (value as TaskPriority) ?? v.priority }))
                }
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="task-category">Categories</Label>
              {/* Plural, and multi-select — a task may carry several, which is
                  what the API accepts, what the cards render, and what
                  /tasks/grouped assumes. */}
              <Combobox
                multi
                id="task-category"
                items={categories.map((c) => ({ value: c.id, label: c.name }))}
                value={values.categoryIds}
                onChange={(categoryIds) => setValues((v) => ({ ...v, categoryIds }))}
                placeholder="No categories"
                searchPlaceholder="Search categories"
                emptyMessage="No categories yet."
              />
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Button type="submit" disabled={pending || !values.title.trim()}>
                {state.mode === 'edit' ? 'Save' : 'Add task'}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              {state.mode === 'edit' ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="ml-auto"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={pending}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this task?</DialogTitle>
            {/* Says what survives, like the categories confirm §14 specifies.
                A confirm that only says "are you sure" makes the user guess. */}
            <DialogDescription>
              The task is removed. Its categories are not — they stay on your other tasks.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (state.mode !== 'edit') return
                remove.mutate(state.id, {
                  onSuccess: () => {
                    setConfirmingDelete(false)
                    onClose()
                  },
                })
              }}
              disabled={remove.isPending}
            >
              {remove.isPending ? 'Deleting…' : 'Delete task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
