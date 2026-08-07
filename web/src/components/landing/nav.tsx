import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { useSessionBoot } from '@/features/auth/use-session'
import { getToken } from '@/lib/token'
import { Wordmark } from './wordmark'

/**
 * Sticky from the start, with a translucent background rather than a scroll
 * listener that swaps classes at some threshold. A sticky header occupies its
 * own height once, at the top of the page, where a header belongs — it is a
 * *fixed* overlay that eats the hero, and this is not one.
 *
 * Three links do not need a hamburger. On mobile the two secondary links drop
 * and the primary action stays, because that is the only one anybody taps.
 *
 * The nav asks whether there is a session. It used to be static, so a signed-in
 * visitor landing on `/` was invited to "Log in" — the session was fine, the
 * page simply never checked. Offering someone a door they are already through
 * reads as having been silently signed out.
 */
export function Nav() {
  // The access token lives in memory, so on a cold load of `/` there is none
  // until the httpOnly refresh cookie has been exchanged. `useSessionBoot`
  // performs that exchange once and is single-flight, so arriving here and then
  // navigating to /app does not rotate the cookie twice.
  const { settled } = useSessionBoot()
  const signedIn = settled && getToken() !== null

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8"
      >
        <Wordmark />

        <div className="flex items-center gap-1 sm:gap-2">
          <a
            href="#features"
            className="relative hit-44 hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
          >
            Features
          </a>

          {/*
            Nothing at all until the exchange settles, rather than the
            signed-out links. It is one same-origin request, so the gap is
            imperceptible — and showing "Log in" for that moment to someone who
            is already signed in is the exact wrong answer this fixes.
          */}
          {!settled ? null : signedIn ? (
            <Button asChild size="sm">
              <Link to="/app">Go to your board</Link>
            </Button>
          ) : (
            <>
              <Link
                to="/login"
                className="relative hit-44 hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
              >
                Log in
              </Link>
              {/* The one primary action on the page. Same words here, in the
                  hero, and in the closing band — an action that changes its name
                  between sections reads as three different actions. */}
              <Button asChild size="sm">
                <Link to="/signup">Get started free</Link>
              </Button>
            </>
          )}

          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
