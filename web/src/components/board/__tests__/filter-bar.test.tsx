import { describe, it, expect } from 'vitest'
import { within } from '@testing-library/react'
import { render, screen, waitFor } from '@/test/render'
import { db, makeCategory, makeTask } from '@/test/handlers'
import { Board } from '@/routes/board'

/**
 * The filter bar, exercised through the board rather than in isolation — the
 * thing worth protecting is not that a callback fires, it is that choosing a
 * filter changes the URL and changes which cards are on screen. The mock API
 * really applies `?filter=`, so a client that forgets to send one fails here.
 */
const column = (name: string) => screen.getByRole('region', { name })

/** Seeds one high and one medium task, both in To do. */
function seedTwoPriorities() {
  db.tasks.push(
    makeTask({ title: 'Fix the outage', status: 'todo', priority: 'high' }),
    makeTask({ title: 'Tidy the README', status: 'todo', priority: 'medium' }),
  )
}

describe('the board filters', () => {
  it('puts the chosen priority in the URL and narrows the board to it', async () => {
    seedTwoPriorities()

    const { user, router } = render(<Board />, { route: '/app' })

    await screen.findByText('Fix the outage')
    expect(screen.getByText('Tidy the README')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Priority'))
    // The options are portalled out of the trigger; `screen` queries the whole
    // document, so they are reachable. `option` rather than the bare text —
    // "High" is also printed on every high-priority card.
    await user.click(await screen.findByRole('option', { name: 'High' }))

    // In the URL, not in component state. Everything below depends on this.
    await waitFor(() => expect(router.state.location.search).toBe('?priority=high'))
    await waitFor(() => expect(screen.queryByText('Tidy the README')).not.toBeInTheDocument())
    expect(screen.getByText('Fix the outage')).toBeInTheDocument()
  })

  it('shows a filtered board when opened at a filtered URL', async () => {
    seedTwoPriorities()

    // Straight to the filtered URL, no interaction — the reload, the bookmark,
    // the pasted link. This is the entire reason the state is in the query
    // string: a filter that evaporates on refresh is worse than none, because
    // the user cannot tell whether the board reset or their data changed.
    render(<Board />, { route: '/app?priority=high' })

    expect(await screen.findByText('Fix the outage')).toBeInTheDocument()
    expect(screen.queryByText('Tidy the README')).not.toBeInTheDocument()
    // And the bar reflects the URL it was opened at, rather than reading "Any
    // priority" over a board that is quietly filtered.
    expect(screen.getByText('Priority: High')).toBeInTheDocument()
  })

  it('shows a chip per active filter, and removing one restores the board', async () => {
    db.categories.push(makeCategory({ id: 'cat-eng', name: 'Engineering' }))
    seedTwoPriorities()

    const { user, router } = render(<Board />, { route: '/app?priority=high&category=cat-eng' })

    // One chip per filter, each naming its own filter — §14's honest answer to
    // "why am I only seeing one task".
    // The category chip names the category, which means waiting for the category
    // list — a chip reading "Category: Unknown" would be a filter the user
    // cannot interpret.
    expect(await screen.findByText('Category: Engineering')).toBeInTheDocument()
    expect(screen.getByText('Priority: High')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove filter: Category: Engineering' }))

    await waitFor(() => expect(router.state.location.search).toBe('?priority=high'))
    expect(screen.queryByText('Category: Engineering')).not.toBeInTheDocument()
    // The chip removal actually put a card back, rather than only editing a URL.
    expect(await screen.findByText('Fix the outage')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove filter: Priority: High' }))

    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(await screen.findByText('Tidy the README')).toBeInTheDocument()
  })

  it('hides "Clear all" while only one filter is active', async () => {
    seedTwoPriorities()

    render(<Board />, { route: '/app?priority=high' })

    // A "Clear all" beside a single chip is two controls for one action, and the
    // chip's own remove button already does it.
    expect(await screen.findByText('Priority: High')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('offers "Clear all" once a second filter is active, and it clears both', async () => {
    db.categories.push(makeCategory({ id: 'cat-eng', name: 'Engineering' }))
    seedTwoPriorities()

    const { user, router } = render(<Board />, { route: '/app?priority=high&category=cat-eng' })

    expect(await screen.findByText('Category: Engineering')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all' }))

    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.queryByText('Priority: High')).not.toBeInTheDocument()
    expect(screen.queryByText('Category: Engineering')).not.toBeInTheDocument()
    expect(await screen.findByText('Tidy the README')).toBeInTheDocument()
  })

  it('says a filter matched nothing, rather than that the board is empty', async () => {
    db.tasks.push(makeTask({ title: 'Tidy the README', status: 'todo', priority: 'medium' }))

    const { user, router } = render(<Board />, { route: '/app?priority=high' })

    // Filtered-empty is a different state from first-run empty. "Add the first
    // thing you need to do" over a board whose tasks are merely hidden reads as
    // data loss — the user has no way to tell the two apart.
    const todo = column('To do')
    await waitFor(() => expect(within(todo).getByText('No matches')).toBeInTheDocument())
    expect(
      within(todo).getByText('No tasks here match the current filters.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument()
    expect(screen.queryByText('Add the first thing you need to do.')).not.toBeInTheDocument()

    // The empty state offers the way out, in the column where the absence is.
    await user.click(within(todo).getByRole('button', { name: 'Clear filters' }))

    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(await screen.findByText('Tidy the README')).toBeInTheDocument()
    // And now the genuinely-empty columns say the first-run thing again.
    expect(within(column('Done')).getByText('Nothing here yet')).toBeInTheDocument()
  })
})
