import { randomBytes } from 'node:crypto'
import { Autowired, HttpException, Service } from '@forinda/kickjs'
import type { User } from '@/db/schema'
import { UsersRepository } from './users.repository'
import { Tokens } from './tokens'
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

@Service()
export class AuthService {
  constructor(
    @Autowired() private readonly users: UsersRepository,
    @Autowired() private readonly tokens: Tokens,
  ) {}

  async signup(dto: SignupDTO): Promise<{ user: PublicUser; token: string }> {
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

      return { user: toPublicUser(user), token: await this.tokens.sign(user.id) }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw HttpException.conflict('Email already registered')
      }
      throw error
    }
  }

  async login(dto: LoginDTO): Promise<{ user: PublicUser; token: string }> {
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

    return { user: toPublicUser(user), token: await this.tokens.sign(user.id) }
  }
}
