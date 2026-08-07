import { describe, it, expect } from 'vitest'
import { within } from '@testing-library/react'
import { render, screen, waitFor } from '../render'
import { db, makeCategory, makeTask } from '../handlers'
import { Board } from '@/routes/board'

/**
 * plan.md §15: "Keyboard: every interactive element reachable by Tab, focus ring
 * visible, detail sheet traps focus and closes on Escape".
 *
 * What this file does NOT assert, deliberately:
 *
 * - **The focus ring.** jsdom does no layout and no paint, and `:focus-visible`
 *   does not match after a synthetic click, so any assertion on `outline` or
 *   `box-shadow` here would pass or fail for reasons unrelated to what a user
 *   sees. Reachability and Tab ORDER are things jsdom can answer honestly; the
 *   ring belongs to the browser checks.
 * - **Arrow-key movement during a keyboard drag.** The pickup is exercised for
 *   real below, but `boardKeyboardCoordinates` resolves the next column from
 *   element rectangles, and every rectangle in jsdom is 0×0 — so an arrow press
 *   has nothing to aim at. The wiring around the gesture is asserted instead,
 *   and the movement itself is left to the browser checks. See the drag section.
 */

/** Seeds one category and `titles` tasks into To do, in the given order. */
function seedTodo(...titles: string[]) {
  db.categories.push(makeCategory({ name: 'Engineering' }))
  titles.forEach((title, i) => db.tasks.push(makeTask({ title, status: 'todo', position: i })))
}

/** Tabs `n` times, returning the element focused after each press. */
async function tabThrough(user: ReturnType<typeof render>['user'], n: number) {
  const stops: Element[] = []
  for (let i = 0; i < n; i++) {
    await user.tab()
    stops.push(document.activeElement!)
  }
  return stops
}

describe('board keyboard access', () => {
  it('reaches every interactive element by Tab, in visual order', async () => {
    seedTodo('Alpha')
    const { user } = render(<Board />, { route: '/app' })

    const card = await screen.findByRole('button', { name: /Alpha/ })
    // The filter comboboxes only settle once the category list resolves; taking
    // the tab order before then would measure a half-rendered board.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Category' })).toBeEnabled())

    // Three buttons read "Add task": the header one, then the empty-state one in
    // each of the two columns that have no cards. In DOM order, which is the
    // order they are read in.
    const [headerAdd, inProgressEmptyAdd, doneEmptyAdd] = screen.getAllByRole('button', {
      name: 'Add task',
    })

    // The visual order of the board, top to bottom and left to right: header,
    // then the page controls, then the filter bar, then each column in turn with
    // its own "add" ahead of its cards.
    const expected = [
      screen.getByRole('link', { name: 'tasky.' }),
      screen.getByRole('link', { name: 'Categories' }),
      screen.getByRole('button', { name: 'Switch to dark theme' }),
      screen.getByRole('button', { name: 'Sign out' }),
      screen.getByRole('button', { name: 'By status' }),
      screen.getByRole('button', { name: 'By category' }),
      headerAdd,
      screen.getByRole('button', { name: 'Priority' }),
      screen.getByRole('button', { name: 'Category' }),
      screen.getByRole('button', { name: 'Add task to To do' }),
      card,
      screen.getByRole('button', { name: 'Add task to In progress' }),
      inProgressEmptyAdd,
      screen.getByRole('button', { name: 'Add task to Done' }),
      doneEmptyAdd,
    ]

    expect(await tabThrough(user, expected.length)).toEqual(expected)

    // One more Tab leaves the document, which is what proves the list above is
    // the WHOLE tab order rather than merely its first fifteen entries — an
    // extra control appended anywhere would show up here.
    await user.tab()
    expect(document.activeElement).toBe(document.body)
  })

  it('gives a card exactly one Tab stop, not one per clickable thing inside it', async () => {
    seedTodo('Alpha', 'Beta')
    const { user } = render(<Board />, { route: '/app' })

    const alpha = await screen.findByRole('button', { name: /Alpha/ })
    const beta = await screen.findByRole('button', { name: /Beta/ })

    // A clickable title inside a clickable card would be a second button here,
    // and would cost keyboard users two stops for one destination.
    expect(within(alpha).queryByRole('button')).toBeNull()
    expect(within(alpha).getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()

    // Two cards, two stops — straight from the column's add button to the first
    // card, to the second, and out into the next column.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Category' })).toBeEnabled())
    const columnAdd = screen.getByRole('button', { name: 'Add task to To do' })
    columnAdd.focus()

    expect(await tabThrough(user, 3)).toEqual([
      alpha,
      beta,
      screen.getByRole('button', { name: 'Add task to In progress' }),
    ])
  })
})

describe('the task sheet', () => {
  it('traps focus: tabbing repeatedly never leaves it', async () => {
    seedTodo('Alpha')
    const { user } = render(<Board />, { route: '/app' })

    await user.click(await screen.findByRole('button', { name: /Alpha/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Task' })

    // Well past the number of controls in the sheet, so the cycle wraps several
    // times. A trap that only holds for one lap is not a trap.
    const stops = await tabThrough(user, 20)
    for (const stop of stops) expect(sheet).toContainElement(stop as HTMLElement)

    // And it genuinely cycles rather than parking on the last control.
    expect(new Set(stops).size).toBeLessThan(stops.length)
  })

  it('closes on Escape', async () => {
    seedTodo('Alpha')
    const { user } = render(<Board />, { route: '/app' })

    await user.click(await screen.findByRole('button', { name: /Alpha/ }))
    await screen.findByRole('dialog', { name: 'Task' })

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('returns focus to the card when the sheet closes', async () => {
    seedTodo('Alpha')
    const { user } = render(<Board />, { route: '/app' })

    const card = await screen.findByRole('button', { name: /Alpha/ })
    await user.click(card)
    await screen.findByRole('dialog', { name: 'Task' })

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    /*
     * This pinned the opposite behaviour when it was written, and finding that
     * is what got it fixed.
     *
     * Radix's modal `Dialog.Content` sets `onCloseAutoFocus` to
     * `preventDefault()` then focus its `Trigger`. The preventDefault cancels
     * FocusScope's own restore, and this sheet has no Trigger — it opens from
     * board state, several components from the card — so nothing was focused
     * and focus fell to `<body>`. A keyboard user who opened a card and pressed
     * Escape restarted their next Tab from the top of the page.
     *
     * The board now remembers what was focused when it opened the sheet and
     * restores it. Asserting the card specifically, not merely "not body", so
     * restoring focus to the wrong element still fails.
     */
    await waitFor(() => expect(document.activeElement).toBe(card))
  })
})

describe('the keyboard drag path', () => {
  it('describes the gesture on the card: role description, instructions, live region', async () => {
    seedTodo('Alpha')
    render(<Board />, { route: '/app' })
    const card = await screen.findByRole('button', { name: /Alpha/ })

    // dnd-kit's `useSortable` sets "sortable" here, not the "draggable" that
    // plain `useDraggable` would. Asserting the literal it actually emits, so
    // this fails if the card silently stops being a sortable — which is the
    // regression worth catching.
    expect(card).toHaveAttribute('aria-roledescription', 'sortable')

    // An `aria-describedby` pointing at nothing is worse than none at all: the
    // gesture is announced as documented and then the documentation is missing.
    const describedBy = card.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const instructions = document.getElementById(describedBy!)
    expect(instructions).not.toBeNull()
    // The instructions must name the keys, or they tell the user nothing.
    expect(instructions).toHaveTextContent(/Space to pick up/i)
    expect(instructions).toHaveTextContent(/arrow keys/i)

    // The channel every drag announcement is written to. Without it the pickup
    // below is silent for the person who most needs to hear it.
    expect(document.querySelector('[aria-live]')).not.toBeNull()
  })

  it('picks a card up with Space and announces which card', async () => {
    seedTodo('Alpha', 'Beta')
    const { user } = render(<Board />, { route: '/app' })

    const card = await screen.findByRole('button', { name: /Alpha/ })
    card.focus()
    await user.keyboard('[Space]')

    // The announcement is the whole feedback channel for a keyboard drag — the
    // visual overlay says nothing to someone who cannot see it. This asserts the
    // pickup really happened AND that `buildAnnouncements` named the task rather
    // than falling back to dnd-kit's coordinate-speak.
    await waitFor(() =>
      expect(document.querySelector('[aria-live]')).toHaveTextContent('Picked up Alpha.'),
    )

    // NOT asserted here: that an arrow key then moves the card. dnd-kit resolves
    // the next drop target from element rectangles, and jsdom reports every
    // rectangle as 0×0, so the arrow press has nothing to aim at and the
    // announcement never advances. Asserting it would be asserting the
    // environment's limits, not the app's behaviour.

    // Cancel the drag before leaving. A pickup left in flight keeps dnd-kit's
    // document-level keydown listener attached past this test's cleanup, and it
    // then swallows the first Enter of whichever test runs next.
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(document.querySelector('[aria-live]')).toHaveTextContent(/Cancelled/i),
    )
  })

  it('opens the sheet on Enter, because only Space is the drag key', async () => {
    seedTodo('Alpha')
    const { user } = render(<Board />, { route: '/app' })

    const card = await screen.findByRole('button', { name: /Alpha/ })
    card.focus()
    await user.keyboard('{Enter}')

    /*
     * dnd-kit's KeyboardSensor claims BOTH Space and Enter by default and
     * `preventDefault()`s the keydown, which cancels the button's activation —
     * so `onClick` never ran and a keyboard user could not open a task on the
     * status board at all. The card is the drag handle and the open button at
     * once, and the drag was winning both keys.
     *
     * The sensor is now configured with Space alone, leaving Enter to the
     * button. Story 12 asserted that Space does NOT open the sheet and never
     * asserted that Enter still does: the gesture being added was tested, the
     * one it silently took over was not.
     */
    expect(await screen.findByRole('dialog', { name: 'Task' })).toBeInTheDocument()
  })

  it('still picks the card up on Space, and does not open the sheet', async () => {
    seedTodo('Alpha')
    const { user } = render(<Board />, { route: '/app' })

    const card = await screen.findByRole('button', { name: /Alpha/ })
    card.focus()
    await user.keyboard('{ }')

    await waitFor(() =>
      expect(document.querySelector('[aria-live]')).toHaveTextContent('Picked up Alpha.'),
    )
    // One key, one action: picking up must not also open the sheet.
    expect(screen.queryByRole('dialog')).toBeNull()

    // End the gesture so its sensor does not outlive this test — a pickup left
    // in flight keeps dnd-kit's document keydown listener alive past cleanup
    // and swallows the next test's keystrokes.
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(document.querySelector('[aria-live]')).toHaveTextContent(/Cancelled/i),
    )
  })

  it('control for the defect above: a card in the category view does open on Enter', async () => {
    const category = makeCategory({ name: 'Engineering' })
    db.categories.push(category)
    db.tasks.push(makeTask({ title: 'Alpha', categoryIds: [category.id] }))

    const { user } = render(<Board />, { route: '/app?view=category' })
    const card = await screen.findByRole('button', { name: /Alpha/ })

    // No drag here, so no dnd attributes and no swallowed keystrokes.
    expect(card).not.toHaveAttribute('aria-roledescription')

    card.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Task' })).toBeInTheDocument()
  })
})
