import { describe, it, expect } from 'vitest'
import { within } from '@testing-library/react'
import { render, screen, waitFor } from '@/test/render'
import { db, makeTask } from '@/test/handlers'
import { Board } from '@/routes/board'

/**
 * The status board, asserted the way someone looking at it would describe it:
 * three named columns, each with a count, each holding the right cards in the
 * right order, and never pretending to be empty while it is still loading.
 *
 * Columns are `<section aria-labelledby>`, which is a `region` with the column
 * name as its accessible name — so every assertion here can be scoped to one
 * column by name rather than by class or position.
 */
const column = (name: string) => screen.getByRole('region', { name })

/** The card titles a column is showing, top to bottom. Cards title with an h4. */
const titlesIn = (name: string) =>
  within(column(name))
    .queryAllByRole('heading', { level: 4 })
    .map((h) => h.textContent)

describe('the board', () => {
  it('shows all three columns with their counts', async () => {
    db.tasks.push(
      makeTask({ title: 'Draft the spec', status: 'todo' }),
      makeTask({ title: 'Write the migration', status: 'todo' }),
      makeTask({ title: 'Review the PR', status: 'in_progress' }),
    )

    render(<Board />, { route: '/app' })

    await screen.findByText('Draft the spec')

    // The count is what tells someone the column is complete. A column that
    // renders its cards but not its total leaves "is that all of them?" open.
    expect(within(column('To do')).getByText('2')).toBeInTheDocument()
    expect(within(column('In progress')).getByText('1')).toBeInTheDocument()
    expect(within(column('Done')).getByText('0')).toBeInTheDocument()
  })

  it('keeps an empty column visible, with guidance of its own', async () => {
    db.tasks.push(makeTask({ title: 'The only task', status: 'todo' }))

    render(<Board />, { route: '/app' })

    await screen.findByText('The only task')

    // §14: a column that vanishes when emptied hides that it exists. Done is the
    // column that starts empty for every new user, so it is the one that must
    // still be there — and it says what would put a card in it, not just "none".
    expect(column('Done')).toBeInTheDocument()
    expect(within(column('Done')).getByText('Finished work lands here.')).toBeInTheDocument()
    expect(
      within(column('In progress')).getByText('Move a task here when you start it.'),
    ).toBeInTheDocument()
  })

  it('puts a task in the column matching its status and nowhere else', async () => {
    db.tasks.push(makeTask({ title: 'Ship the release', status: 'done' }))

    render(<Board />, { route: '/app' })

    await waitFor(() => expect(titlesIn('Done')).toEqual(['Ship the release']))
    expect(titlesIn('To do')).toEqual([])
    expect(titlesIn('In progress')).toEqual([])
  })

  it('renders a column in position order, not the order it was stored', async () => {
    // Seeded deliberately out of order: insertion order says Third/First/Second,
    // position says First/Second/Third. A board that renders insertion order
    // passes every "the tasks are there" assertion and is still wrong — and it
    // is the order the drop handler reads to name a card's new neighbour.
    db.tasks.push(
      makeTask({ title: 'Third', status: 'todo', position: 30 }),
      makeTask({ title: 'First', status: 'todo', position: 10 }),
      makeTask({ title: 'Second', status: 'todo', position: 20 }),
    )

    render(<Board />, { route: '/app' })

    await waitFor(() => expect(titlesIn('To do')).toEqual(['First', 'Second', 'Third']))
  })

  it('spells out each priority instead of relying on its colour alone', async () => {
    db.tasks.push(
      makeTask({ title: 'Urgent thing', status: 'todo', priority: 'high' }),
      makeTask({ title: 'Ordinary thing', status: 'in_progress', priority: 'medium' }),
      makeTask({ title: 'Someday thing', status: 'done', priority: 'low' }),
    )

    render(<Board />, { route: '/app' })

    await screen.findByText('Urgent thing')

    // Roughly one in twelve men has some colour vision deficiency. A dot that is
    // the only carrier of "high" is unreadable to them, and unreadable in a
    // screenshot, and unreadable read aloud. The word is the floor.
    expect(within(column('To do')).getByText('High')).toBeInTheDocument()
    expect(within(column('In progress')).getByText('Medium')).toBeInTheDocument()
    expect(within(column('Done')).getByText('Low')).toBeInTheDocument()
  })

  it('does not claim the board is empty while it is still loading', async () => {
    db.tasks.push(makeTask({ title: 'Arrives once the query resolves', status: 'todo' }))

    render(<Board />, { route: '/app' })

    // Synchronously after mount, before the columns have resolved. Three empty
    // columns during load is indistinguishable from a genuinely empty board —
    // the "working app reads as broken" failure §14 names.
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument()
    expect(screen.queryByText('Add the first thing you need to do.')).not.toBeInTheDocument()
    // The count reads as unknown rather than as zero, one per column.
    expect(screen.getAllByText('–')).toHaveLength(3)

    // And the wait was worth waiting for — otherwise this test would also pass
    // against a board that never rendered anything at all.
    expect(await screen.findByText('Arrives once the query resolves')).toBeInTheDocument()
  })
})
