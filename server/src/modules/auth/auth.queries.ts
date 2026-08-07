import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { Database } from '@/db/database'
import { refreshTokens, users, type RefreshToken, type User } from '@/db/schema'
import type { Tokens } from './tokens'

/**
 * Every database read and write the auth use cases perform, as plain functions
 * taking the Database. Kept in one place so no use case grows its own copy of a
 * query — in particular `revokeFamily`, which is the breach response and must
 * behave identically wherever it is reached from.
 */

/** The user shape that leaves the API. Deliberately has no passwordHash. */
export interface PublicUser {
  id: string
  email: string
  name: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Built from an explicit field list, never by spreading the row — a spread
 * would carry passwordHash into every response the day someone adds a field.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

/**
 * What every successful authentication hands back. `refreshToken` and its
 * expiry go straight into an httpOnly cookie by the controller and must never
 * reach a response body — a refresh token in JSON is readable by script, which
 * is the entire thing this design exists to prevent.
 */
export interface AuthResult {
  user: PublicUser
  accessToken: string
  refreshToken: string
  refreshExpiresAt: Date
}

export interface CreateUserInput {
  email: string
  passwordHash: string
  name: string
}

export async function createUser(database: Database, input: CreateUserInput): Promise<User> {
  const [row] = database.db.insert(users).values(input).returning().all()
  return row
}

export async function findUserByEmail(database: Database, email: string): Promise<User | null> {
  const [row] = database.db.select().from(users).where(eq(users.email, email)).all()
  return row ?? null
}

export async function findUserById(database: Database, id: string): Promise<User | null> {
  const [row] = database.db.select().from(users).where(eq(users.id, id)).all()
  return row ?? null
}

/** Looked up by hash because the plaintext is never stored. */
export async function findRefreshTokenByHash(
  database: Database,
  tokenHash: string,
): Promise<RefreshToken | null> {
  const [row] = database.db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .all()
  return row ?? null
}

/** Rotation: mark spent and point at the successor, for auditing a chain. */
export async function revokeRefreshToken(
  database: Database,
  id: string,
  replacedById: string | null,
): Promise<void> {
  database.db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), replacedById, updatedAt: new Date() })
    .where(eq(refreshTokens.id, id))
    .run()
}

/**
 * Breach response: kill every live token descended from one login.
 *
 * Only the live ones — re-stamping already-revoked rows would overwrite the
 * `revokedAt` that recorded when rotation actually happened, which is the
 * audit trail you want most on the day this fires.
 */
export async function revokeRefreshTokenFamily(
  database: Database,
  familyId: string,
): Promise<void> {
  database.db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
    .run()
}

/**
 * Mints a session and persists its refresh token. Shared by signup, login and
 * refresh so the family rules live in exactly one place.
 *
 * Called with no `familyId` it starts a new rotation family — one per login,
 * not one per user, so signing out on a phone does not kill the desktop
 * session. Refresh passes the existing family through to stay in the chain.
 *
 * Returns the stored row's id alongside the result: rotation needs it to
 * record `replacedById` on the token it supersedes.
 */
export async function issueSession(
  database: Database,
  tokens: Tokens,
  user: User,
  // Widened to string: randomUUID()'s template-literal return type would
  // otherwise refuse the plain string coming back from the database.
  familyId: string = randomUUID(),
): Promise<AuthResult & { rowId: string }> {
  const refresh = tokens.mintRefresh()

  const [row] = database.db
    .insert(refreshTokens)
    .values({
      userId: user.id,
      familyId,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    })
    .returning()
    .all()

  return {
    rowId: row.id,
    user: toPublicUser(user),
    accessToken: await tokens.signAccess(user.id),
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  }
}
