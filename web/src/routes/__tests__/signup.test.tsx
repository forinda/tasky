import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@/test/render'
import { Signup } from '@/routes/signup'

/**
 * plan.md §15: "Auth flow: signup, login, token persisted, 401 clears and
 * redirects". The signup half — that an account gets created and lands on the
 * board, and that a rejected one explains itself under the field that caused
 * it rather than in one anonymous line above the form.
 */

const appRoute = { path: '/app', element: <p>Your board</p> }

function renderSignup() {
  return render(<Signup />, { route: '/signup', routes: [appRoute] })
}

describe('Signup', () => {
  it('sends a valid signup to the board', async () => {
    const { user, router } = renderSignup()

    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'a-long-password')
    await user.click(screen.getByRole('button', { name: 'Get started free' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
  })

  /**
   * A 422 carries one message per field. Rendering them as a single line above
   * the form technically shows the text and still leaves someone guessing which
   * of three inputs to fix — and leaves a screen reader announcing "invalid"
   * with no reason attached. `aria-invalid` marks the input; `aria-describedby`
   * is what ties the reason to it.
   */
  it('puts each server message on the field that caused it', async () => {
    const { user } = renderSignup()

    // Every field wrong at once, so this fails if the component renders only
    // the first error — which is what `body.message` alone would give.
    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Get started free' }))

    const name = await screen.findByLabelText('Name')
    const email = screen.getByLabelText('Email')
    const password = screen.getByLabelText('Password')

    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-invalid', 'true')

    // `toHaveAccessibleDescription` resolves `aria-describedby` the way a
    // screen reader does, so this asserts the wiring and not just that the text
    // exists somewhere on the page.
    expect(name).toHaveAccessibleDescription('Enter your name')
    expect(email).toHaveAccessibleDescription('Enter a valid email address')
    expect(password).toHaveAccessibleDescription('Use at least 8 characters')
  })

  it('does not navigate when the name is blank', async () => {
    const { user, router } = renderSignup()

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'a-long-password')
    await user.click(screen.getByRole('button', { name: 'Get started free' }))

    expect(await screen.findByText('Enter your name')).toBeInTheDocument()
    // Leaving for the board on a rejected signup would strand someone on a
    // protected screen with no account behind it.
    expect(router.state.location.pathname).toBe('/signup')
  })

  it('labels all three fields for real', () => {
    renderSignup()

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('asks the password manager to generate, not to autofill', () => {
    renderSignup()

    // `current-password` here would make a manager autofill the password of
    // some other account into the one being created.
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
  })
})
