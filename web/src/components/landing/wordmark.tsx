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
        'font-display text-xl font-bold tracking-[-0.03em] text-foreground',
        className,
      )}
    >
      adero
      <span className="text-primary">.</span>
    </Link>
  )
}
