import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { authQueries } from '@/features/auth/queries'

export function Landing() {
  return (
    <main className="min-h-dvh bg-background text-foreground p-8">
      <h1 className="text-display">Adero</h1>
      <p className="text-muted-foreground mt-2">Landing page arrives in Story 9.</p>
      <Link to="/app" className="text-brand underline mt-4 inline-block">
        Go to the board
      </Link>
    </main>
  )
}

export function Login() {
  return <main className="p-8">Login — Story 10.</main>
}

export function Signup() {
  return <main className="p-8">Signup — Story 10.</main>
}

/**
 * Not the board — that is Story 11. This exists to prove the whole chain works:
 * typed client, dev proxy, token header, and TanStack Query, in one visible
 * place. If this renders an email, everything underneath is wired.
 */
export function Board() {
  const { data, error, isPending } = useQuery(authQueries.me())

  if (isPending) return <main className="p-8">Loading…</main>
  if (error) return <main className="p-8 text-muted-foreground">Not signed in.</main>

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-foreground">Board</h1>
      <p className="text-muted-foreground">Signed in as {data.email}</p>
    </main>
  )
}
