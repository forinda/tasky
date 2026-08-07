import { describe, it, expect } from 'vitest'
import { Link } from 'react-router'
import { render, screen, waitFor } from '@/test/render'
import { Login } from '@/routes/login'

/**
 * plan.md §15: "Auth flow: signup, login, token persisted, 401 clears and
 * redirects". These cover the login half — that a good password gets you to the
 * board, that a bad one does not, and that the refusal says the same thing to a
 * stranger as it does to a customer.
 */

/** Somewhere to land, so a redirect can be asserted rather than assumed. */
const appRoute = { path: '/app', element: <p>Your board</p> }

describe('Login', () => {
  it('sends a valid sign-in to the board', async () => {
    const { user, router } = render(<Login />, { route: '/login', routes: [appRoute] })

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'a-good-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    // The location, not the presence of the placeholder: a component that
    // rendered the board without navigating would leave the URL on /login and
    // the back button pointing at the wrong screen.
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
  })

  it('shows the server’s refusal and stays put', async () => {
    const { user, router } = render(<Login />, { route: '/login', routes: [appRoute] })

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    // Staying is half the behaviour. Navigating away from a failed sign-in
    // would drop what was typed and hide the reason it failed.
    expect(router.state.location.pathname).toBe('/login')
  })

  /**
   * The one test here that protects a security property rather than a
   * behaviour.
   *
   * Story 3's login hashes a dummy password when the email matches nobody,
   * so the miss and the wrong-password branch take the same time and cannot be
   * told apart by a clock. Copy that said "no account with that email" would
   * hand back, in plain text, exactly the account-enumeration oracle that
   * timing work was written to close — and it would do it without touching the
   * server, so no server test would notice.
   *
   * Hence the exact string, twice, from both branches.
   */
  it('refuses an unknown account and a wrong password in identical words', async () => {
    async function messageFor(email: string) {
      const { user, unmount } = render(<Login />, { route: '/login', routes: [appRoute] })
      await user.type(screen.getByLabelText('Email'), email)
      await user.type(screen.getByLabelText('Password'), 'wrong')
      await user.click(screen.getByRole('button', { name: 'Sign in' }))
      const text = (await screen.findByRole('alert')).textContent
      unmount()
      return text
    }

    const known = await messageFor('ada@example.com')
    const unknown = await messageFor('nobody@example.com')

    expect(known).toBe('Invalid email or password')
    expect(unknown).toBe('Invalid email or password')
  })

  it('prefills the email carried over from the landing hero', async () => {
    // The hero navigates with `state: { email }`; a Link carrying the same
    // state is that trip, made by clicking. `render`'s `route` option cannot
    // express it — an initial entry given as a plain string has no state.
    const { user } = render(<Link to="/login" state={{ email: 'ada@example.com' }}>Sign in</Link>, {
      route: '/',
      routes: [{ path: '/login', element: <Login /> }],
    })

    await user.click(screen.getByRole('link', { name: 'Sign in' }))

    // If this breaks, the hero's email field is a decoration that asks for
    // something and throws it away.
    expect(await screen.findByLabelText('Email')).toHaveValue('ada@example.com')
  })

  it('labels both fields for real', () => {
    render(<Login />, { route: '/login', routes: [appRoute] })

    // `getByLabelText` will not match a placeholder, which is the point: a
    // placeholder vanishes the moment someone types, exactly when they want to
    // check which box they are in.
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('asks the password manager for the saved password, not a new one', () => {
    render(<Login />, { route: '/login', routes: [appRoute] })

    // `new-password` here would make managers offer to generate a fresh
    // password on the sign-in screen, which is the wrong offer.
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })
})
