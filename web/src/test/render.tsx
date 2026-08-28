import type { ReactElement, ReactNode } from 'react'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { ThemeProvider } from 'next-themes'

/**
 * A fresh QueryClient per test. Sharing one leaks a previous test's cache into
 * the next, which shows up as a component rendering data the current test never
 * seeded — and it fails intermittently, by test order, which is the worst way to
 * find out.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // No retries: a test asserting an error state would otherwise wait for
      // three attempts and time out instead of failing on the assertion.
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

interface RenderOptions {
  /** Initial URL. Filter and view state live in the query string. */
  route?: string
  /** Extra routes, for tests that assert a redirect actually lands somewhere. */
  routes?: Array<{ path: string; element: ReactNode }>
}

/**
 * Renders a component inside the providers the app actually mounts — router,
 * query client, theme. Omitting any of them makes components throw for reasons
 * that have nothing to do with what is being tested.
 *
 * `createMemoryRouter`, not `BrowserRouter`: tests assert on the URL after a
 * navigation, and a memory router gives a real location without touching
 * jsdom's history.
 */
export function render(ui: ReactElement, { route = '/', routes = [] }: RenderOptions = {}) {
  const router = createMemoryRouter(
    [
      { path: '/', element: ui },
      // The element under test is mounted at `/` AND at the requested route, so
      // a caller can render at `/app?priority=high` without declaring routes.
      ...(route.split('?')[0] === '/' ? [] : [{ path: route.split('?')[0], element: ui }]),
      ...routes.map((r) => ({ path: r.path, element: r.element as ReactElement })),
    ],
    { initialEntries: [route] },
  )

  const result = rtlRender(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={makeQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  )

  return { ...result, router, user: userEvent.setup() }
}

export { screen, waitFor, userEvent }
