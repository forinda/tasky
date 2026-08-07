import { Link } from 'react-router'
import { cn } from '@/lib/utils'

/**
 * The display face earns its keep here. Lowercase and tightly tracked — the
 * same treatment as the hero headline, so the page has one voice rather than a
 * logo that looks borrowed from a different product.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        // `relative hit-44` — the wordmark is a 55x28 link, the smallest
        // target in the header. See the hit-44 note in index.css.
        'relative hit-44 font-display text-xl font-bold tracking-[-0.03em] text-foreground',
        className,
      )}
    >
      tasky
      <span className="text-primary">.</span>
    </Link>
  )
}
