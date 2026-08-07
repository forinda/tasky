import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BoardVignette } from './board-vignette'

export function Hero() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')

  // The field earns its place only because what is typed here arrives at the
  // signup form. An email input that discards its value is a decoration that
  // costs the user real effort.
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    navigate('/signup', { state: { email } })
  }

  return (
    <section className="relative">
      <div className="mx-auto max-w-6xl px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
        <div className="max-w-2xl">
          {/* Factual, and about the product rather than its adoption. There are
              no users yet; a count or a "trusted by" line would be invented. */}
          <p className="rise font-mono type-meta tracking-wider text-muted-foreground uppercase">
            No projects. No sprints. No burndown charts.
          </p>

          <h1 className="rise type-display mt-4" style={{ animationDelay: '60ms' }}>
            Stop losing tasks in a list.
          </h1>

          <p
            className="rise mt-5 max-w-xl text-lg text-muted-foreground"
            style={{ animationDelay: '120ms' }}
          >
            Three columns, your own categories, and priorities you can read at a glance.
          </p>

          <form
            onSubmit={onSubmit}
            className="rise mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
            style={{ animationDelay: '180ms' }}
          >
            <div className="flex-1">
              <Label htmlFor="hero-email" className="sr-only">
                Email address
              </Label>
              <Input
                id="hero-email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@work.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {/* Same words as the nav and the closing band. */}
            <Button type="submit">Get started free</Button>
          </form>
        </div>

        <BoardVignette
          className="rise mt-16 sm:mt-20"
          style={{ animationDelay: '240ms' }}
        />
      </div>
    </section>
  )
}
