/**
 * The access token lives in memory and nowhere else.
 *
 * Not `localStorage`, not `sessionStorage`, not a non-httpOnly cookie — every
 * one of those is readable by any script that runs on the page, which is the
 * hole this design closes. The token survives a client-side navigation and is
 * deliberately lost on reload; `refreshSession()` mints a new one from the
 * httpOnly cookie the browser sends but script cannot read.
 *
 * If you are here because "the token disappears on refresh": that is the
 * design. Persist it and the refresh cookie stops being worth having.
 */
let accessToken: string | null = null

export function getToken(): string | null {
  return accessToken
}

export function setToken(token: string): void {
  accessToken = token
}

export function clearToken(): void {
  accessToken = null
}
