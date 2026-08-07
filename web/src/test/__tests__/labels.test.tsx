import { describe, it, expect } from 'vitest'
import { within } from '@testing-library/react'
import { render, screen, waitFor } from '../render'
import { db, makeCategory, makeTask } from '../handlers'
import { Board } from '@/routes/board'
import { Categories } from '@/routes/categories'
import { Login } from '@/routes/login'
import { Signup } from '@/routes/signup'

/**
 * Accessible names, and the wiring that makes an error message reach the person
 * who needs it.
 *
 * `getByLabelText` and `getByRole(…, { name })` are the instruments throughout,
 * and both are chosen because they FAIL on the things that look fine on screen:
 * a placeholder standing in for a label satisfies neither, and an icon-only
 * button with no `aria-label` has no name to match. Asserting on the visible
 * text instead would pass for markup a screen reader cannot describe.
 *
 * Both queries are used on the comboboxes on purpose. `getByLabelText` proves a
 * `<label for>` points at the control; `getByRole(…, { name })` proves that
 * association actually produces an ACCESSIBLE NAME rather than a `for` attribute
 * assistive tech ignores. The two are not the same claim, and only the second is
 * what a screen reader reads out.
 *
 * Not asserted anywhere here: anything visual. jsdom does no layout or paint, so
 * whether a label is legible, positioned, or visible at all is a browser
 * question, not one this file can answer.
 */

describe('auth screens', () => {
  it('names every control on the sign-in form', async () => {
    render(<Login />, { route: '/login' })

    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('names every control on the sign-up form', async () => {
    render(<Signup />, { route: '/signup' })

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Get started free' })).toBeInTheDocument()
  })

  it('wires each field error to its input, so the reason is announced with the field', async () => {
    const { user } = render(<Signup />, { route: '/signup' })

    // The server 422s both of these, and answers with one message per field.
    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Get started free' }))

    for (const [field, message] of [
      ['Email', 'Enter a valid email address'],
      ['Password', 'Use at least 8 characters'],
    ] as const) {
      const input = await waitFor(() => {
        const el = screen.getByLabelText(field)
        expect(el).toHaveAttribute('aria-invalid', 'true')
        return el
      })

      // `aria-invalid` alone announces "invalid" and leaves the user guessing
      // which rule they broke. The describedby is what carries the reason.
      const describedBy = input.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      expect(document.getElementById(describedBy!)).toHaveTextContent(message)
    }
  })

  it('announces a rejected sign-in as an alert', async () => {
    const { user } = render(<Login />, { route: '/login' })

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    // A 401 is deliberately not attributed to either field — the server does not
    // say which was wrong, and neither may this. So it is a form-level alert,
    // and the fields stay unmarked.
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid')
  })
})

describe('the task sheet', () => {
  it('names every form control', async () => {
    db.categories.push(makeCategory({ name: 'Engineering' }))
    db.tasks.push(makeTask({ title: 'Alpha', status: 'todo' }))
    const { user } = render(<Board />, { route: '/app' })

    await user.click(await screen.findByRole('button', { name: /Alpha/ }))
    // Scoped to the sheet: the board behind it has its own "Priority" filter,
    // and an unscoped query would match either one and prove nothing about this.
    const sheet = within(await screen.findByRole('dialog', { name: 'Task' }))

    expect(sheet.getByLabelText('Title')).toBeInTheDocument()
    expect(sheet.getByLabelText('Description')).toBeInTheDocument()

    // The three comboboxes are <button> triggers. A `<label for>` on a button is
    // easy to write and easy to get wrong, so each is checked twice — once for
    // the association, once for the resulting accessible name.
    for (const name of ['Status', 'Priority', 'Categories']) {
      expect(sheet.getByLabelText(name)).toBe(sheet.getByRole('button', { name }))
    }

    expect(sheet.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('names each selected-category chip remove for the category it removes', async () => {
    const category = makeCategory({ name: 'Engineering' })
    db.categories.push(category)
    db.tasks.push(makeTask({ title: 'Alpha', status: 'todo', categoryIds: [category.id] }))
    const { user } = render(<Board />, { route: '/app' })

    await user.click(await screen.findByRole('button', { name: /Alpha/ }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Task' }))

    // Not a bare "Remove": with several categories on a task that is a row of
    // identical buttons, and the list read aloud says nothing about which is
    // which.
    expect(await sheet.findByRole('button', { name: 'Remove Engineering' })).toBeInTheDocument()
  })
})

describe('the categories screen', () => {
  it('names the form controls and the colour choices', async () => {
    db.categories.push(makeCategory({ name: 'Engineering' }))
    const { user } = render(<Categories />, { route: '/categories' })

    await user.click(await screen.findByRole('button', { name: 'New category' }))

    expect(screen.getByLabelText('Name')).toBeInTheDocument()

    // The swatches are one control, so the fieldset's legend is the group's
    // name, and each radio carries the colour's name — a dot alone is invisible
    // to anyone who cannot separate the hues.
    const colours = within(screen.getByRole('group', { name: 'Colour' }))
    expect(colours.getByRole('radio', { name: 'Indigo' })).toBeInTheDocument()
    expect(colours.getByRole('radio', { name: 'Violet' })).toBeInTheDocument()
    expect(colours.getAllByRole('radio')).toHaveLength(8)
  })

  it('names each row action for the row it acts on', async () => {
    db.categories.push(makeCategory({ name: 'Engineering' }))
    db.categories.push(makeCategory({ name: 'Personal' }))
    render(<Categories />, { route: '/categories' })

    // Two bare "Rename" buttons are indistinguishable in a screen reader's list
    // of buttons, which is a common way to navigate a page. The row's name is
    // appended in an `sr-only` span, so it is part of the button's name without
    // being part of its visible label.
    //
    // Matched with a whitespace-tolerant pattern rather than the literal string:
    // the name is built from two nodes ("Rename" + " Engineering"), and
    // `dom-accessibility-api` trims each node's contribution and joins with no
    // separator, yielding "RenameEngineering" here where a browser would
    // normally read out "Rename Engineering". That is a difference in the name
    // COMPUTATION, not in the markup, so pinning the exact spacing would be
    // asserting a quirk of the test environment.
    for (const name of ['Engineering', 'Personal']) {
      expect(
        await screen.findByRole('button', { name: new RegExp(`^Rename\\s*${name}$`) }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: new RegExp(`^Delete\\s*${name}$`) }),
      ).toBeInTheDocument()
    }
  })

  it('wires a rejected name to the input rather than only showing it', async () => {
    db.categories.push(makeCategory({ name: 'Engineering' }))
    const { user } = render(<Categories />, { route: '/categories' })

    await user.click(await screen.findByRole('button', { name: 'New category' }))
    await user.type(screen.getByLabelText('Name'), 'Engineering')
    await user.click(screen.getByRole('button', { name: 'Add category' }))

    const input = await waitFor(() => {
      const el = screen.getByLabelText('Name')
      expect(el).toHaveAttribute('aria-invalid', 'true')
      return el
    })

    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent('Category already exists')
    // Also an alert, so it is announced when it appears rather than only when
    // the field is next visited.
    expect(screen.getByRole('alert')).toHaveTextContent('Category already exists')
  })
})

describe('icon-only buttons', () => {
  it('names the theme toggle for what pressing it does', async () => {
    render(<Board />, { route: '/app' })

    // The label names the destination, not the current state: a button called
    // "Dark" is ambiguous about which way it goes.
    const toggle = await screen.findByRole('button', { name: 'Switch to dark theme' })
    expect(toggle).toBeInTheDocument()
    // Nothing but an aria-hidden icon inside, so the label is the only name it
    // has — which is exactly why its absence would be silent.
    expect(toggle).toHaveTextContent('')
  })

  it('names each per-column add for its column', async () => {
    render(<Board />, { route: '/app' })

    for (const column of ['To do', 'In progress', 'Done']) {
      expect(await screen.findByRole('button', { name: `Add task to ${column}` })).toBeInTheDocument()
    }
  })

  it('names a filter chip remove for the filter it removes', async () => {
    db.tasks.push(makeTask({ title: 'Alpha', status: 'todo', priority: 'high' }))
    render(<Board />, { route: '/app?priority=high' })

    // "Remove" on its own would be useless in a list of chips; the chip has to
    // say which filter it drops.
    expect(
      await screen.findByRole('button', { name: 'Remove filter: Priority: High' }),
    ).toBeInTheDocument()
  })
})

describe('the board as landmarks', () => {
  it('makes each status column a labelled region', async () => {
    render(<Board />, { route: '/app' })

    // `section` + `aria-labelledby` is what turns the board into three navigable
    // regions instead of one undifferentiated pile of buttons. A `section`
    // without a name is not exposed as a region at all, so naming it is what
    // makes it exist.
    for (const column of ['To do', 'In progress', 'Done']) {
      expect(await screen.findByRole('region', { name: column })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('region')).toHaveLength(3)
  })

  it('makes each category column a labelled region', async () => {
    const category = makeCategory({ name: 'Engineering' })
    db.categories.push(category)
    db.tasks.push(makeTask({ title: 'Alpha', categoryIds: [category.id] }))
    render(<Board />, { route: '/app?view=category' })

    expect(await screen.findByRole('region', { name: 'Engineering' })).toBeInTheDocument()
    // The uncategorized bucket is a column like any other and needs naming too.
    expect(screen.getByRole('region', { name: 'Uncategorized' })).toBeInTheDocument()
  })
})
