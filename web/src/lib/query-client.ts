import { QueryClient } from '@tanstack/react-query'
import { KickClientError } from '@forinda/kickjs-client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx will not succeed on retry — the request was wrong, not unlucky.
      // Retrying wastes time and, on the auth routes, burns the 10/min rate
      // limit that protects login.
      retry: (count, error) =>
        error instanceof KickClientError && error.status < 500 ? false : count < 3,
    },
  },
})
