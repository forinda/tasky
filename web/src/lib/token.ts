const STORAGE_KEY = 'tasky.token'

/**
 * ponytail: the token lives in localStorage, which any successful XSS can read.
 * The mitigations here are that React escapes by default and this codebase uses
 * no `dangerouslySetInnerHTML`. The stronger design is an httpOnly refresh
 * cookie plus a short-lived in-memory access token — a different auth design
 * than plan.md §6 describes, so revisit the two together rather than piecemeal.
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Safari private mode and some embedded webviews throw on access.
    return null
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // Losing persistence is survivable; crashing the sign-in is not.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing useful to do — the caller is signing out either way.
  }
}
