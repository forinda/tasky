import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { setToken, clearToken } from '@/lib/token'
import { authKeys } from './keys'

/** Story 10 builds the screens; the data layer is settled here. */
export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post('/auth/login', { body }),
    onSuccess: (result) => {
      setToken(result.token)
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
      setToken(result.token)
      void queryClient.invalidateQueries({ queryKey: authKeys.all })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()

  return () => {
    clearToken()
    queryClient.clear()
  }
}
