import { useEffect, useSyncExternalStore } from 'react'
import { isSessionSettled, refreshSession, subscribeToSession } from './session'

/**
 * Runs the boot refresh once and reports whether it has finished.
 *
 * The access token lives in memory, so a reload starts with nothing. Without
 * this, `ProtectedRoute` would see a null token on every hard refresh of `/app`
 * and bounce a perfectly signed-in user to the login screen.
 *
 * StrictMode double-invokes effects in development. That is harmless here:
 * `refreshSession` is single-flight, so the second call joins the first rather
 * than rotating the cookie twice.
 */
export function useSessionBoot(): { settled: boolean } {
  const settled = useSyncExternalStore(subscribeToSession, isSessionSettled, () => true)

  useEffect(() => {
    if (!isSessionSettled()) void refreshSession()
  }, [])

  return { settled }
}
