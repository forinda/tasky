import { clearToken, getToken, setToken } from '@/lib/token'

/**
 * The in-flight refresh, shared by every caller.
 *
 * This is the whole point of the module. A board view fires several queries at
 * once; when the access token has expired they all come back 401 together. If
 * each one refreshed independently, the second rotation would present a token
 * the first had already spent — which the server correctly treats as a replay
 * and answers by revoking the entire family. Five parallel refreshes would log
 * the user out. One shared promise is what makes rotation safe on the client.
 */
let inFlight: Promise<boolean> | null = null

/** Set once the boot refresh has settled, so ProtectedRoute knows to stop waiting. */
let settled = false
const listeners = new Set<() => void>()

function markSettled() {
  if (settled) return
  settled = true
  for (const listener of listeners) listener()
}

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isSessionSettled(): boolean {
  return settled
}

/**
 * Exchanges the httpOnly refresh cookie for a new access token.
 *
 * Uses raw `fetch`, not the typed client — the client routes through
 * `authFetch`, which calls this on a 401, and that is a loop.
 */
export async function refreshSession(): Promise<boolean> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })

      if (!res.ok) {
        clearToken()
        return false
      }

      const body = (await res.json()) as { accessToken?: string }
      if (!body.accessToken) {
        clearToken()
        return false
      }

      setToken(body.accessToken)
      return true
    } catch {
      // Network failure is not proof of being signed out, but there is no
      // usable token either way and the caller's next move is the same.
      clearToken()
      return false
    } finally {
      inFlight = null
      markSettled()
    }
  })()

  return inFlight
}

/**
 * The client's `fetch`. Retries a 401 exactly once, behind a shared refresh.
 *
 * Exactly once matters: if the retry could itself trigger a refresh-and-retry,
 * a server that answers 401 unconditionally would produce an infinite loop of
 * rotations rather than a failed request.
 */
export async function authFetch(request: Request): Promise<Response> {
  // Cloned before sending — a Request's body is a stream, and consuming it in
  // the first attempt leaves nothing to replay.
  const replay = request.clone()

  const response = await fetch(request)
  if (response.status !== 401) return response

  // A 401 from the refresh endpoint means the cookie is gone or spent. There
  // is nothing to refresh with, and retrying would recurse.
  //
  // The base is a placeholder so this parses whether the client handed us an
  // absolute URL or a relative one; only the pathname is read. Using
  // `location.origin` would tie the module to a DOM it does not otherwise need.
  if (new URL(request.url, 'http://localhost').pathname.endsWith('/auth/refresh')) {
    return response
  }

  const refreshed = await refreshSession()
  if (!refreshed) return response

  const headers = new Headers(replay.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  return fetch(new Request(replay, { headers }))
}

/** Test seam: reset module state between cases. */
export function resetSessionForTests(): void {
  inFlight = null
  settled = false
  listeners.clear()
  clearToken()
}
