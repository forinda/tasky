import { createBrowserRouter, Navigate } from 'react-router'
import { getToken } from '@/lib/token'
import { Board, Landing, Login, Signup } from './routes/placeholders'
import { Gallery } from './routes/gallery'

/**
 * Story 10 wires real auth; the shape is settled now so later screens slot in
 * rather than restructuring. Reads the token on every render rather than
 * caching it, so signing out takes effect on the next navigation.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
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
