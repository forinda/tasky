import { randomBytes, randomUUID } from 'node:crypto'
import { Autowired, HttpException, Service } from '@forinda/kickjs'
import type { User } from '@/db/schema'
import { UsersRepository } from './users.repository'
import { RefreshTokensRepository } from './refresh-tokens.repository'
import { Tokens, hashRefreshToken } from './tokens'
import { hashPassword, verifyPassword } from './password'
import type { SignupDTO } from './dtos/signup.dto'
import type { LoginDTO } from './dtos/login.dto'

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
 * Hashed ONCE at module load, against a random value nobody can supply.
 *
 * The point of a dummy hash is that both branches of `login` perform the same
 * number of scrypt calls. Hashing on demand did the opposite: the known-email
 * branch ran one scrypt, the unknown-email branch ran two (hash, then verify
 * against it), making unknown emails measurably SLOWER — 37ms vs 58ms in one
 * measurement, 33ms vs 72ms in another. That is precisely the enumeration
 * oracle this exists to close, and login has no rate limit.
 */
const DUMMY_HASH = hashPassword(randomBytes(32).toString('hex'))

/**
 * SQLite surfaces a unique-index violation as SQLITE_CONSTRAINT_UNIQUE. Match
 * on the code where available and fall back to the message, since the driver
 * wraps errors differently depending on the call path.
 */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT') return true
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
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

@Service()
export class AuthService {
  constructor(
    @Autowired() private readonly users: UsersRepository,
    @Autowired() private readonly tokens: Tokens,
    @Autowired() private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  /**
   * Starts a new rotation family — one per login, not one per user, so signing
   * out on a phone does not kill the desktop session.
   *
   * Returns the stored row's id alongside the result: rotation needs it to
   * record `replacedById` on the token it supersedes.
   */
  private async issue(
    user: User,
    // Widened to string: randomUUID()'s template-literal return type would
    // otherwise refuse the plain string coming back from the database.
    familyId: string = randomUUID(),
  ): Promise<AuthResult & { rowId: string }> {
    const refresh = this.tokens.mintRefresh()

    const row = await this.refreshTokens.create({
      userId: user.id,
      familyId,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    })

    return {
      rowId: row.id,
      user: toPublicUser(user),
      accessToken: await this.tokens.signAccess(user.id),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    }
  }

  /**
   * Rotation with reuse detection.
   *
   * Presenting a token that has already been rotated away means one of two
   * things: a replay, or a stolen cookie being used alongside the real one.
   * Neither is distinguishable from the other, and both are answered the same
   * way — revoke the whole family. That logs the honest user out too. It is the
   * intended behaviour, not collateral damage: a rotated token turning up again
   * is the only signal available that a token was stolen, and staying quiet
   * would leave the attacker with a working session.
   */
  async refresh(presented: string): Promise<AuthResult> {
    const invalid = () => HttpException.unauthorized('Invalid or expired session')

    const row = await this.refreshTokens.findByHash(hashRefreshToken(presented))
    if (!row) throw invalid()

    if (row.revokedAt) {
      await this.refreshTokens.revokeFamily(row.familyId)
      throw invalid()
    }

    if (row.expiresAt.getTime() <= Date.now()) throw invalid()

    const user = await this.users.findById(row.userId)
    // The FK is ON DELETE cascade, so this should be unreachable. Treated as a
    // failed refresh rather than a 500 because the caller's next move is the
    // same either way: sign in again.
    if (!user) throw invalid()

    const { rowId, ...issued } = await this.issue(user, row.familyId)
    await this.refreshTokens.revoke(row.id, rowId)

    return issued
  }

  /** Idempotent by design: signing out twice is not an error worth reporting. */
  async logout(presented: string | undefined): Promise<void> {
    if (!presented) return
    const row = await this.refreshTokens.findByHash(hashRefreshToken(presented))
    if (row) await this.refreshTokens.revokeFamily(row.familyId)
  }

  async signup(dto: SignupDTO): Promise<AuthResult> {
    // No pre-check. A `findByEmail` before the insert is a check-then-insert
    // race with a ~30ms scrypt yield in the middle: five concurrent identical
    // signups all passed it, and the four losers hit the raw driver error and
    // fell out as 500s carrying the SQL text and a stack trace. The database
    // constraint is the only authority that cannot lose that race.
    try {
      const user = await this.users.create({
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        name: dto.name,
      })

      const { rowId: _rowId, ...issued } = await this.issue(user)
      return issued
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw HttpException.conflict('Email already registered')
      }
      throw error
    }
  }

  async login(dto: LoginDTO): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email)

    // Both branches now run exactly one scrypt: the hit verifies against the
    // stored hash, the miss verifies against DUMMY_HASH (already computed at
    // module load). See the DUMMY_HASH comment for why the previous form was
    // backwards.
    const stored = user?.passwordHash ?? (await DUMMY_HASH)
    const ok = await verifyPassword(dto.password, stored)

    // Identical message either way — a distinct "no such user" would hand out
    // a user-enumeration oracle.
    if (!user || !ok) throw HttpException.unauthorized('Invalid email or password')

    const { rowId: _rowId, ...issued } = await this.issue(user)
    return issued
  }
}
