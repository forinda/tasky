import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Wordmark } from './wordmark'

/**
 * Sticky from the start, with a translucent background rather than a scroll
 * listener that swaps classes at some threshold. A sticky header occupies its
 * own height once, at the top of the page, where a header belongs — it is a
 * *fixed* overlay that eats the hero, and this is not one.
 *
 * Three links do not need a hamburger. On mobile the two secondary links drop
 * and the primary action stays, because that is the only one anybody taps.
 */
export function Nav() {
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
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
          >
            Features
          </a>
          <Link
            to="/login"
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
          >
            Log in
          </Link>
          {/* The one primary action on the page. Same words here, in the hero,
              and in the closing band — an action that changes its name between
              sections reads as three different actions. */}
          <Button asChild size="sm">
            <Link to="/signup">Get started free</Link>
          </Button>
        </div>
      </nav>
    </header>
  )
}
