import { HttpException, getRequestValue } from '@forinda/kickjs'
import type { PublicUser } from '@/modules/auth/auth.service'

/**
 * The current user, read from the request frame rather than threaded through
 * every call.
 *
 * `getRequestValue` reads the same store `ctx.get()` does and is typed off the
 * `ContextMeta` augmentation in the CurrentUser contributor, so a use case can
 * have it without the controller drilling it down through three signatures.
 *
 * It **throws** when there is no user, and that is the point. `getRequestValue`
 * itself is deliberately null-tolerant — it returns `undefined` outside a
 * request frame (background jobs, startup, a test with no
 * `requestScopeMiddleware`). Every ownership rule in this API is enforced by a
 * `where ownerId = ?`, so an `undefined` slipping into one of those is the one
 * failure that must never be quiet: it would either match nothing and look like
 * an empty account, or throw somewhere far from the cause.
 *
 * Making absence loud here is what lets the use cases treat ownership as
 * ambient without giving up the guarantee that used to come from the compiler
 * forcing an `ownerId` parameter at every call site.
 */
export function requireCurrentUser(): PublicUser {
  const user = getRequestValue('currentUser')

  if (!user) {
    // 401 rather than 500: the only way to reach this on a real request is a
    // route that forgot `@CurrentUser`, and the honest answer to an
    // unauthenticated caller is "you are not signed in".
    throw HttpException.unauthorized('Not signed in')
  }

  return user
}

/** The owner id alone, which is what most queries actually want. */
export function currentOwnerId(): string {
  return requireCurrentUser().id
}
