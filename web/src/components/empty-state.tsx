import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** Short. Gets the display face — this is one of the few places the app speaks. */
  title: string
  /**
   * An instruction, not a label. "No tasks" describes a condition; "Add your
   * first task to this column" tells someone what to do about it.
   */
  guidance: string
  /** Part of the component, so no caller has to remember to add one. */
  action?: ReactNode
  /**
   * `column` sits inside a board column and stays compact — a column that
   * vanishes when emptied is a broken board, so this has to hold its place
   * without shouting. `page` is for a whole empty screen.
   */
  variant?: 'column' | 'page'
  className?: string
}

/**
 * An empty screen is an invitation to act, not a shrug.
 *
 * Almost every product ships a dashed grey rectangle saying "No tasks" here.
 * It is the component that recurs most and gets the least thought, which is
 * exactly why it carries this product's voice.
 */
export function EmptyState({
  title,
  guidance,
  action,
  variant = 'column',
  className,
}: EmptyStateProps) {
  const isPage = variant === 'page'

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg text-center',
        // A hairline rather than a dashed box: dashes read as "broken" or
        // "drop here", and only one of those is true.
        'border border-hairline bg-surface',
        isPage ? 'gap-3 px-8 py-16' : 'gap-2 px-4 py-8',
        className,
      )}
    >
      <p className={cn('font-display font-semibold text-ink', isPage ? 'text-2xl' : 'text-base')}>
        {title}
      </p>
      <p className={cn('text-muted max-w-xs', isPage ? 'text-body' : 'text-meta')}>{guidance}</p>
      {action ? <div className={isPage ? 'mt-2' : 'mt-1'}>{action}</div> : null}
    </div>
  )
}
