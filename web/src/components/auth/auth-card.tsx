import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Wordmark } from '@/components/landing/wordmark'

interface AuthCardProps {
  title: string
  /** One line under the title. Says what this screen is for, not what it is. */
  intro: string
  /** Rendered above the fields when the whole submission failed. */
  error?: string | null
  children: ReactNode
  /** The other screen — signup links to login and back. */
  footer: ReactNode
}

export function AuthCard({ title, intro, error, children, footer }: AuthCardProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="px-5 py-6 sm:px-8">
        <Wordmark />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pt-6 pb-16 sm:items-center sm:px-8 sm:pt-0">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">{title}</h1>
          <p className="mt-2 type-body text-muted-foreground">{intro}</p>

          {error ? (
            // role="alert" so it is announced when it appears — a message that
            // only exists visually is invisible to the person least able to
            // guess what went wrong.
            <p
              role="alert"
              className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 type-body text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-6">{children}</div>

          <p className="mt-6 type-meta text-muted-foreground">{footer}</p>
        </div>
      </main>
    </div>
  )
}

/** The link between the two screens, styled once. */
export function AuthSwitch({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-foreground underline underline-offset-4">
      {children}
    </Link>
  )
}
