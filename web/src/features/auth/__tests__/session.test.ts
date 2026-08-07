import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { authFetch, refreshSession, resetSessionForTests } from '../session'
import { getToken, setToken } from '@/lib/token'

// Relative: refreshSession uses a same-origin path, which is what a browser
// resolves against the current document.
const REFRESH_URL = '/api/v1/auth/refresh'
const ME_URL = 'http://localhost/api/v1/auth/me'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  resetSessionForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('refreshSession', () => {
  it('stores the new access token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ accessToken: 'fresh' })),
    )

    expect(await refreshSession()).toBe(true)
    expect(getToken()).toBe('fresh')
  })

  it('clears the token when the cookie is gone', async () => {
    setToken('stale')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ title: 'Unauthorized' }, 401)),
    )

    expect(await refreshSession()).toBe(false)
    expect(getToken()).toBeNull()
  })

  /**
   * The property this module exists for.
   *
   * A board view fires several queries at once. When the access token has
   * expired they all 401 together, and if each refreshed on its own the second
   * rotation would present a token the first had already spent — which the
   * server correctly reads as a replay and answers by revoking the family. The
   * user would be signed out by their own app loading normally.
   */
  it('collapses concurrent callers into ONE network refresh', async () => {
    const fetchMock = vi.fn(async () => {
      // A real refresh is not instant; resolving synchronously would let the
      // callers serialise and hide a missing shared promise.
      await new Promise((resolve) => setTimeout(resolve, 10))
      return jsonResponse({ accessToken: 'fresh' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.all([
      refreshSession(),
      refreshSession(),
      refreshSession(),
      refreshSession(),
      refreshSession(),
    ])

    expect(results).toEqual([true, true, true, true, true])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('starts a new refresh once the previous one has settled', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ accessToken: 'fresh' }))
    vi.stubGlobal('fetch', fetchMock)

    await refreshSession()
    await refreshSession()

    // Sharing must not become caching — an expired token later still needs a
    // real exchange.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('authFetch', () => {
  it('passes a successful response straight through', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'u1' }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await authFetch(new Request(ME_URL))

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes and replays the request once on a 401', async () => {
    setToken('expired')
    const calls: string[] = []
    const fetchMock = vi.fn(async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url
      calls.push(url)
      if (url.endsWith('/auth/refresh')) return jsonResponse({ accessToken: 'fresh' })
      // First attempt carries the expired token, the replay carries the new one.
      const auth = typeof input === 'string' ? null : input.headers.get('Authorization')
      return auth === 'Bearer fresh' ? jsonResponse({ id: 'u1' }) : jsonResponse({}, 401)
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await authFetch(
      new Request(ME_URL, { headers: { Authorization: 'Bearer expired' } }),
    )

    expect(res.status).toBe(200)
    expect(calls).toEqual([ME_URL, REFRESH_URL, ME_URL])
  })

  it('does not retry when the refresh itself fails', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 401))
    vi.stubGlobal('fetch', fetchMock)

    const res = await authFetch(new Request(ME_URL))

    expect(res.status).toBe(401)
    // Original attempt plus one refresh. A second attempt at the original would
    // mean the failed refresh had not been believed.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never tries to refresh a 401 from the refresh endpoint itself', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 401))
    vi.stubGlobal('fetch', fetchMock)

    const res = await authFetch(new Request('http://localhost/api/v1/auth/refresh', { method: 'POST' }))

    expect(res.status).toBe(401)
    // Exactly one call: recursing here is an infinite rotation loop.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('replays a request with a body', async () => {
    setToken('expired')
    let replayedBody: string | null = null
    const fetchMock = vi.fn(async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.endsWith('/auth/refresh')) return jsonResponse({ accessToken: 'fresh' })
      const req = input as Request
      // Read the body on EVERY attempt, because that is what a real fetch does
      // — it consumes the stream whether the response is 200 or 401. A mock
      // that only reads on the successful replay leaves the stream intact and
      // passes happily without the clone, which is exactly what this test is
      // supposed to catch.
      const body = await req.text()
      const auth = req.headers.get('Authorization')
      if (auth !== 'Bearer fresh') return jsonResponse({}, 401)
      replayedBody = body
      return jsonResponse({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await authFetch(
      new Request('http://localhost/api/v1/tasks', {
        method: 'POST',
        headers: { Authorization: 'Bearer expired', 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Ship it' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(replayedBody).toBe(JSON.stringify({ title: 'Ship it' }))
  })
})
