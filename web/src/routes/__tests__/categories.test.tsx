import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { render, screen, waitFor } from '@/test/render'
import { db, makeCategory, makeTask } from '@/test/handlers'
import { Categories } from '@/routes/categories'

/**
 * Categories are labels, not folders — deleting one must never take tasks with
 * it, and the screen has to say so before the user commits. plan.md §15. Create
 * and rename are the same form component, so both call sites are exercised: a
 * shared form that only works on one of them is the failure mode it exists to
 * avoid.
 *
 * Rows are addressed by their buttons rather than by their visible name. The
 * name appears three times per row — once as the label, twice more inside the
 * buttons' sr-only suffixes — so `getByText('Design')` is ambiguous, not wrong.
 * The exact space is not cosmetic: the accessible-name algorithm trims each text node
 * before joining, so a space inside the sr-only span vanishes and "Rename" +
 * " Design" computed as "RenameDesign" — announced as one word. The space now
 * sits outside the span in category-row.tsx; this pattern REQUIRES it, so the
 * fix cannot silently regress.
 */
const rowNamed = (name: string) => new RegExp(`^Rename ${name}$`)
const deleteNamed = (name: string) => new RegExp(`^Delete ${name}$`)

describe('the categories screen', () => {
  it('renders the categories you already have', async () => {
    db.categories.push(makeCategory({ name: 'Design' }), makeCategory({ name: 'Operations' }))

    render(<Categories />, { route: '/categories' })

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Design')
    expect(items[1]).toHaveTextContent('Operations')
  })

  it('adds a category inline and shows it in the list', async () => {
    db.categories.push(makeCategory({ name: 'Design' }))

    const { user } = render(<Categories />, { route: '/categories' })

    await user.click(await screen.findByRole('button', { name: 'New category' }))
    await user.type(screen.getByLabelText('Name'), 'Operations')
    await user.click(screen.getByRole('button', { name: 'Add category' }))

    // In the list, not merely in the database: the list has to refetch, or the
    // category exists on the server and nowhere the user can see it.
    expect(await screen.findByRole('button', { name: rowNamed('Operations') })).toBeInTheDocument()
    expect(db.categories.map((c) => c.name)).toEqual(['Design', 'Operations'])
  })

  it('says a duplicate name is taken, rather than failing generically', async () => {
    db.categories.push(makeCategory({ name: 'Design' }))

    const { user } = render(<Categories />, { route: '/categories' })

    await user.click(await screen.findByRole('button', { name: 'New category' }))
    await user.type(screen.getByLabelText('Name'), 'Design')
    await user.click(screen.getByRole('button', { name: 'Add category' }))

    // The 409 carries its own message and it has to reach the user. "Something
    // went wrong. Try again." is advice to repeat an action that cannot succeed,
    // and the user would keep retrying a name that will never be accepted.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Category already exists')
    expect(alert).not.toHaveTextContent('Something went wrong')
    // The form stays open on the rejected name, so it can be edited rather than
    // retyped from scratch.
    expect(screen.getByLabelText('Name')).toHaveValue('Design')
  })

  it('renames a category inline', async () => {
    db.categories.push(makeCategory({ name: 'Design' }))

    const { user } = render(<Categories />, { route: '/categories' })

    await user.click(await screen.findByRole('button', { name: rowNamed('Design') }))
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Product design')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByRole('button', { name: rowNamed('Product design') }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: rowNamed('Design') })).not.toBeInTheDocument()
    expect(db.categories[0].name).toBe('Product design')
  })

  it('asks before deleting, and says the tasks survive as uncategorised', async () => {
    const design = makeCategory({ name: 'Design' })
    db.categories.push(design)
    db.tasks.push(makeTask({ title: 'Rewire the doorbell', categoryIds: [design.id] }))

    const { user } = render(<Categories />, { route: '/categories' })

    // Wait for the count, so the confirm speaks in tasks rather than hedging
    // with "Any tasks in it" while that request is still in flight.
    expect(await screen.findByText('1 task')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: deleteNamed('Design') }))

    const confirm = within(await screen.findByRole('dialog', { name: /^Delete\s*“Design”\?$/ }))
    // The substance, not merely that a dialog appeared. "This cannot be undone"
    // would make the user assume the worst and keep a category they wanted gone;
    // the promise is specific, so the assertion is on the specific promise.
    expect(confirm.getByText(/will not be deleted/)).toHaveTextContent(
      '1 task in it will not be deleted. They stay on your board and become uncategorised — only the category itself is removed, for good.',
    )
    // Asking is not doing.
    expect(db.categories).toHaveLength(1)

    await user.click(confirm.getByRole('button', { name: 'Delete category' }))

    await waitFor(() => expect(db.categories).toHaveLength(0))
    // The promise, checked against what actually happened: the task is still
    // there and has only lost the label.
    expect(db.tasks).toHaveLength(1)
    expect(db.tasks[0].categoryIds).toEqual([])
  })

  it('“Keep it” cancels the delete and the category is still there', async () => {
    db.categories.push(makeCategory({ name: 'Design' }))

    const { user } = render(<Categories />, { route: '/categories' })

    await user.click(await screen.findByRole('button', { name: deleteNamed('Design') }))
    await user.click(await screen.findByRole('button', { name: 'Keep it' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(db.categories).toHaveLength(1)
    expect(screen.getByRole('button', { name: rowNamed('Design') })).toBeInTheDocument()
  })

  it('tells you what to do when there are no categories yet', async () => {
    render(<Categories />, { route: '/categories' })

    expect(await screen.findByText('No categories yet')).toBeInTheDocument()
    // An empty state that only reports emptiness is a dead end. This one has to
    // say what a category is for and offer the way out of the empty screen.
    expect(screen.getByText(/Create one to group your tasks/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New category' })).toBeInTheDocument()
  })
})
