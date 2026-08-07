import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/landing/wordmark'
import { ThemeToggle } from '@/components/theme-toggle'
import { authQueries } from '@/features/auth/queries'
import { useLogout } from '@/features/auth/mutations'

/**
 * Not the board — that is Story 11. This exists to prove the whole chain works:
 * typed client, dev proxy, token header, and TanStack Query, in one visible
 * place. If this renders an email, everything underneath is wired.
 *
 * Story 10 adds the sign-out control, because the auth loop cannot be exercised
 * end to end without one.
 */
export function Board() {
  const { data, error, isPending } = useQuery(authQueries.me())
  const logout = useLogout()

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </header>

      <main className="p-8">
        {isPending ? <p className="text-muted-foreground">Loading…</p> : null}
        {error ? <p className="text-muted-foreground">Not signed in.</p> : null}
        {data ? (
          <>
            <h1 className="font-display text-2xl font-bold">Board</h1>
            <p className="text-muted-foreground">Signed in as {data.email}</p>
          </>
        ) : null}
      </main>
    </div>
  )
}
