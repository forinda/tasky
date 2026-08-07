export const REFRESH_COOKIE = 'tasky_refresh'

/**
 * The cookie is scoped to the auth routes, so it is not attached to every task
 * request. A credential that rides along on traffic that does not need it is a
 * credential with a larger attack surface than it needs.
 */
export const REFRESH_COOKIE_PATH = '/api/v1/auth'

interface CookieAttributes {
  httpOnly: true
  secure: boolean
  sameSite: 'strict'
  path: string
  maxAge?: number
}

/**
 * One place for the attributes, because each of them is load-bearing:
 *
 *   httpOnly  The entire point of this design. Script cannot read it, so an XSS
 *             gets at most a 15-minute access token and no way to renew it.
 *   secure    Production only. A `Secure` cookie is silently dropped over plain
 *             http, so setting it unconditionally breaks local development in a
 *             way that looks like a logic bug.
 *   sameSite  Strict. The app is same-origin in development (Vite proxies) and
 *             in production (SpaAdapter serves the client), so no legitimate
 *             flow needs a cross-site send. This is the primary CSRF defence.
 *   path      See REFRESH_COOKIE_PATH.
 */
function attributes(maxAgeMs?: number): CookieAttributes {
  return {
    httpOnly: true,
    // `process.env` rather than `getEnv('NODE_ENV')`, and not by preference:
    // web's tsconfig pulls this file into its program through the generated
    // route-type bridge, where the server's KickEnv augmentation is not
    // registered and `getEnv('NODE_ENV')` types its argument as `never`. The
    // value is identical — the env schema has already refused to boot if
    // NODE_ENV is unset, so nothing is being trusted here that was not
    // validated at startup.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    ...(maxAgeMs === undefined ? {} : { maxAge: Math.floor(maxAgeMs / 1000) }),
  }
}

interface CookieResponse {
  cookie(name: string, value: string, options: CookieAttributes): unknown
  clearCookie(name: string, options: Omit<CookieAttributes, 'maxAge'>): unknown
}

export function setRefreshCookie(res: CookieResponse, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, attributes(expiresAt.getTime() - Date.now()))
}

export function clearRefreshCookie(res: CookieResponse): void {
  // Same attributes minus maxAge: a browser only removes a cookie when the
  // clearing directive matches the original's name, path, and domain.
  const { maxAge: _maxAge, ...rest } = attributes()
  res.clearCookie(REFRESH_COOKIE, rest)
}

/**
 * Reads the refresh cookie off the raw `Cookie` header.
 *
 * `cookie-parser` is not mounted, and mounting it app-wide to read one cookie
 * on two routes is more moving parts than the four lines below. Values are
 * base64url, so there is nothing to decode beyond the header framing.
 */
export function readRefreshCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() !== REFRESH_COOKIE) continue
    return decodeURIComponent(part.slice(index + 1).trim()) || undefined
  }
  return undefined
}

/**
 * Defence in depth behind SameSite=Strict.
 *
 * A present `Origin` that does not match the host is rejected. An absent one is
 * allowed: non-browser clients omit it, and every browser that would attach the
 * cookie cross-site is already stopped by SameSite. Rejecting absent origins
 * would break curl and the test suite while adding nothing against a browser.
 */
export function isOriginAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    // An unparseable Origin is not a same-origin request.
    return false
  }
}
