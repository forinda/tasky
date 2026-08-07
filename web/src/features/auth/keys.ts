/**
 * Query keys mirror endpoint paths, so an invalidation reads like the route it
 * affects. Keeping them in one place stops a typo in a key from silently
 * creating a second cache entry that never invalidates.
 */
export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
}
