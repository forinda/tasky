import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers, resetDb } from './handlers'

/**
 * Resolve relative URLs the way a browser does.
 *
 * The API client's `baseUrl` is the relative `/api/v1` — deliberately, so the
 * browser hits Vite in development and the API itself in production, same-origin
 * both ways. Node's `fetch`/`Request` (undici) reject a relative URL outright:
 * `new Request('/api/v1/tasks')` throws "Failed to parse URL".
 *
 * So the app is correct and the environment is not. Absolutising against
 * `location.origin` here makes the test environment behave like the browser,
 * rather than changing production code to suit the test runner — which would be
 * fixing the wrong end of the problem.
 */
const OriginalRequest = globalThis.Request
const absolute = (input: RequestInfo | URL): RequestInfo | URL =>
  typeof input === 'string' && input.startsWith('/') ? new URL(input, location.origin).href : input

globalThis.Request = class extends OriginalRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(absolute(input) as RequestInfo, init)
  }
} as unknown as typeof Request

const originalFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  originalFetch(absolute(input) as RequestInfo, init)) as typeof fetch

export const server = setupServer(...handlers)

beforeAll(() => {
  // `error`, not `warn` or `bypass`. An unhandled request means the app called
  // something this suite does not model — silently letting it through would
  // either hit a real dev server (passing on one machine, failing on another)
  // or return undefined and surface far from the cause.
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetDb()
})

afterAll(() => server.close())

/**
 * jsdom implements neither of these, and both are load-bearing here:
 * `matchMedia` backs the theme provider and the reduced-motion hook, and
 * `ResizeObserver` backs Radix's popover positioning. Without them the Combobox
 * throws on open and every filter test fails for a reason unrelated to filters.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    // The deprecated pair as well: next-themes still calls `addListener`, and
    // without it the ThemeProvider throws on mount and every test using the
    // real providers fails for a reason unrelated to what it asserts.
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

// Radix measures with these before positioning a popover; jsdom returns 0 for
// everything, which is fine, but the methods must exist.
window.HTMLElement.prototype.scrollIntoView = () => {}
window.HTMLElement.prototype.hasPointerCapture = () => false
window.HTMLElement.prototype.setPointerCapture = () => {}
window.HTMLElement.prototype.releasePointerCapture = () => {}
