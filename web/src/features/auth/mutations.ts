import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '@/lib/api'
import { setToken, clearToken } from '@/lib/token'
import { authKeys } from './keys'

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api.post('/auth/login', { body }),
    onSuccess: (result) => {
      setToken(result.accessToken)
      // Invalidate rather than seed: the /auth/me shape is the server's to
      // define, and seeding it here would duplicate that definition.
      void queryClient.invalidateQueries({ queryKey: authKeys.all })
    },
  })
}

export function useSignup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: { email: string; password: string; name: string }) =>
      api.post('/auth/signup', { body }),
    onSuccess: (result) => {
      setToken(result.accessToken)
      void queryClient.invalidateQueries({ queryKey: authKeys.all })
    },
  })
}

/**
 * Signing out is a server-side act now, not a client-side one.
 *
 * Clearing local state alone would leave the refresh cookie live, so the very
 * next page load would silently sign the user back in — the opposite of what
 * they asked for, and on a shared machine a real problem. The endpoint revokes
 * the family and clears the cookie; the local clear is the mop-up.
 */
export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => api.post('/auth/logout', {}),
    // `onSettled`, not `onSuccess`: if the request fails the user still asked
    // to be signed out, and leaving them looking signed in is the worse of the
    // two failures.
    onSettled: () => {
      clearToken()
      queryClient.clear()
      void navigate('/login', { replace: true })
    },
  })
}
