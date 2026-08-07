import { createClient } from '@forinda/kickjs-client'
import { authFetch } from '@/features/auth/session'
import { getToken } from './token'

/**
 * `KickApi` is ambient — declared by the server's `kick typegen` output and
 * pulled in by src/types/kick-routes.d.ts. Do not import it.
 *
 * Because the client is generic over it, a renamed route or a changed Zod body
 * on the server becomes a compile error here rather than a runtime 404.
 */
export const api = createClient<KickApi>({
  // Relative: the browser hits Vite in development (which proxies) and the API
  // itself in production (which serves this bundle). Same-origin both ways.
  baseUrl: '/api/v1',
  // A factory, invoked per request — so a token stored after the client was
  // constructed is still picked up, and signing out takes effect immediately.
  // Return type annotated: without it TS infers the union
  // `{ Authorization: string } | { Authorization?: undefined }`, which is not
  // assignable to the option's `Record<string, string>`.
  headers: (): Record<string, string> => {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
  // Every call goes through the 401-retry wrapper, so an expired access token
  // is renewed and the request replayed without the caller knowing. Wiring it
  // here rather than at each call site is what makes that guarantee total.
  fetch: authFetch,
})
