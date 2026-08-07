/**
 * Compatibility re-export. The AuthService class is gone — each operation is
 * now its own use case (`*.use-case.ts`) over `auth.queries.ts`.
 *
 * `PublicUser` and `toPublicUser` were exported from here and are imported by
 * `src/shared/context.ts` and the categories module, which are owned elsewhere.
 * This file stays so those import paths keep resolving; delete it once they
 * point at `./auth.queries` directly.
 */
export { toPublicUser, type PublicUser, type AuthResult } from './auth.queries'
