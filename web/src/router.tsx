import { createBrowserRouter, Navigate } from 'react-router'
import { getToken } from '@/lib/token'
import { useSessionBoot } from '@/features/auth/use-session'
import { Board } from './routes/placeholders'
import { Login } from './routes/login'
import { Signup } from './routes/signup'
import { Landing } from './routes/landing'
import { Gallery } from './routes/gallery'

/**
 * Waits for the boot refresh before deciding anything.
 *
 * The access token is held in memory, so immediately after a reload there is no
 * token yet — not because the user is signed out, but because the exchange with
 * the httpOnly cookie has not finished. Redirecting on that would bounce a
 * signed-in user to `/login` on every hard refresh of `/app`, which looks
 * exactly like a broken session.
 *
 * Renders nothing while waiting rather than a spinner: the refresh is one
 * same-origin request, and a spinner that flashes for 30ms is worse than a
 * frame of blank.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { settled } = useSessionBoot()

  if (!settled) return null
  return getToken() ? children : <Navigate to="/login" replace />
}

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  {
    path: '/app',
    element: (
      <ProtectedRoute>
        <Board />
      </ProtectedRoute>
    ),
  },
  // Dev only. `import.meta.env.DEV` is substituted with a literal at build
  // time, so this whole entry — and the Gallery import above — is dead code in
  // production and drops out. Verified by grepping dist/, not assumed.
  ...(import.meta.env.DEV ? [{ path: '/gallery', element: <Gallery /> }] : []),
])
