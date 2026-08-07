import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/**
 * Reads the preference at runtime, for the cases CSS cannot reach.
 *
 * Most motion in this codebase is disabled in CSS, which is the right place —
 * see the `rise` utility. A JS hook is needed only where a library takes an
 * animation as a prop, as dnd-kit's drop animation does: there is no stylesheet
 * to opt out of.
 *
 * Subscribed rather than read once, so someone who changes the setting while
 * the tab is open gets the new behaviour without a reload.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    // Server snapshot: assume reduced. Guessing "animate" for someone who
    // asked not to is the worse of the two wrong answers.
    () => true,
  )
}
