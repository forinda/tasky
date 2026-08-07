import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { render, screen, waitFor } from '@/test/render'
import { db, makeCategory, makeTask } from '@/test/handlers'
import { TaskSheet } from '@/components/board/task-sheet'
import { Board } from '@/routes/board'

/**
 * The sheet is the only way to change a task's fields, and — until a drag lands
 * — the only way to move one between columns. plan.md §14 says the board has to
 * be fully usable without dragging, so the status path here is not a detail of
 * a form; it is the board's write operation.
 *
 * `TaskSheet` is controlled, so most tests drive it directly through this
 * wrapper: `onClose` has to actually close it, or "saving closes the sheet"
 * would assert nothing.
 */
function EditSheet({
  id,
  categories = [],
}: {
  id: string
  categories?: Array<{ id: string; name: string }>
}) {
  const [open, setOpen] = useState(true)
  return (
    <TaskSheet
      state={open ? { mode: 'edit', id } : { mode: 'closed' }}
      categories={categories}
      onClose={() => setOpen(false)}
    />
  )
}

describe('the task sheet', () => {
  it('loads the task’s current values into the form', async () => {
    const design = makeCategory({ name: 'Design' })
    db.categories.push(design)
    db.tasks.push(
      makeTask({
        id: 'task-1',
        title: 'Rewire the doorbell',
        description: 'The chime is dead',
        priority: 'high',
        status: 'in_progress',
        categoryIds: [design.id],
      }),
    )

    render(<EditSheet id="task-1" categories={db.categories} />)

    // Every field, not just the title: a sheet that seeds one field and blanks
    // the rest saves those blanks over real data the moment you press Save.
    expect(await screen.findByDisplayValue('Rewire the doorbell')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toHaveValue('The chime is dead')
    expect(screen.getByLabelText('Status')).toHaveTextContent('In progress')
    expect(screen.getByLabelText('Priority')).toHaveTextContent('High')
    expect(screen.getByLabelText('Categories')).toHaveTextContent('1 selected')
    expect(screen.getByRole('button', { name: 'Remove Design' })).toBeInTheDocument()
  })

  it('saves an edited title and closes the sheet', async () => {
    db.tasks.push(makeTask({ id: 'task-1', title: 'Rewire the doorbell' }))

    const { user } = render(<EditSheet id="task-1" />)

    const title = await screen.findByDisplayValue('Rewire the doorbell')
    await user.clear(title)
    await user.type(title, 'Rewire the doorbell properly')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // The mock server's copy of the task, i.e. what the request actually sent.
    await waitFor(() => expect(db.tasks[0].title).toBe('Rewire the doorbell properly'))
    // Left open, the user cannot tell a save from a no-op.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('moves a task between columns by changing its status', async () => {
    db.tasks.push(makeTask({ id: 'task-1', title: 'Rewire the doorbell', status: 'todo' }))

    const { user } = render(<Board />, { route: '/app' })

    // Through the real board, not the sheet alone: the claim is that the card
    // ends up in another column, and only the board can show that.
    await user.click(await screen.findByRole('button', { name: /Rewire the doorbell/ }))

    const sheet = within(await screen.findByRole('dialog', { name: 'Task' }))
    await user.click(sheet.getByLabelText('Status'))
    // The options are portalled out of the sheet, so they are found on `screen`.
    await user.click(await screen.findByRole('option', { name: 'Done' }))
    await user.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Done' })).getByRole('button', {
          name: /Rewire the doorbell/,
        }),
      ).toBeInTheDocument(),
    )
    expect(
      within(screen.getByRole('region', { name: 'To do' })).queryByRole('button', {
        name: /Rewire the doorbell/,
      }),
    ).not.toBeInTheDocument()
  })

  it('keeps both categories when two are picked from the multi-select', async () => {
    const design = makeCategory({ name: 'Design' })
    const operations = makeCategory({ name: 'Operations' })
    db.categories.push(design, operations)
    db.tasks.push(makeTask({ id: 'task-1', title: 'Rewire the doorbell' }))

    const { user } = render(<EditSheet id="task-1" categories={db.categories} />)
    const sheet = within(await screen.findByRole('dialog', { name: 'Task' }))

    await user.click(sheet.getByLabelText('Categories'))
    // No reopening between picks, deliberately. Clicking the trigger again would
    // close the popover, and Escape closes the whole sheet — so a test that
    // "reopened" between selections would be testing a flow that does not exist.
    await user.click(await screen.findByRole('option', { name: 'Design' }))
    await user.click(screen.getByRole('option', { name: 'Operations' }))

    // The second pick must not replace the first, which is the single-select
    // behaviour this control is explicitly not.
    expect(sheet.getByLabelText('Categories')).toHaveTextContent('2 selected')
    expect(sheet.getByRole('button', { name: 'Remove Design' })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: 'Remove Operations' })).toBeInTheDocument()

    await user.click(sheet.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.tasks[0].categoryIds).toEqual([design.id, operations.id]))
  })

  it('asks before deleting, and says what survives', async () => {
    const design = makeCategory({ name: 'Design' })
    db.categories.push(design)
    db.tasks.push(
      makeTask({ id: 'task-1', title: 'Rewire the doorbell', categoryIds: [design.id] }),
    )

    const { user } = render(<EditSheet id="task-1" categories={db.categories} />)
    await screen.findByDisplayValue('Rewire the doorbell')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const confirm = within(await screen.findByRole('dialog', { name: 'Delete this task?' }))
    // The substance, not merely that a dialog appeared: deleting a task does not
    // take its categories down with it. A confirm that only said "are you sure"
    // would leave the user guessing at exactly the wrong moment.
    expect(
      confirm.getByText(/Its categories are not — they stay on your other tasks/),
    ).toBeInTheDocument()
    // Asking is not doing.
    expect(db.tasks).toHaveLength(1)

    await user.click(confirm.getByRole('button', { name: 'Delete task' }))
    await waitFor(() => expect(db.tasks).toHaveLength(0))
    // The category is untouched, which is what the sentence promised.
    expect(db.categories).toHaveLength(1)
  })

  it('“Keep it” cancels the delete and the task is still there', async () => {
    db.tasks.push(makeTask({ id: 'task-1', title: 'Rewire the doorbell' }))

    const { user } = render(<EditSheet id="task-1" />)
    await screen.findByDisplayValue('Rewire the doorbell')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Keep it' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Delete this task?' })).not.toBeInTheDocument(),
    )
    expect(db.tasks).toHaveLength(1)
    // Still editable, rather than backing out of the sheet along with the dialog.
    expect(screen.getByDisplayValue('Rewire the doorbell')).toBeInTheDocument()
  })
})
