import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

/**
 * The third and last appearance of the same action, with the same words. A
 * closing band that says "Try it now" when the nav says "Get started free"
 * reads as two different offers.
 */
export function CtaBand() {
  return (
    <section className="border-t border-border bg-primary/8">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-20 sm:px-8 sm:py-24 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="type-title max-w-md">Start with one task.</h2>
          <p className="mt-2 type-body text-muted-foreground">
            No credit card, no trial countdown, no setup wizard.
          </p>
        </div>
        <Button asChild size="lg">
          <Link to="/signup">Get started free</Link>
        </Button>
      </div>
    </section>
  )
}
