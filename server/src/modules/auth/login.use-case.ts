import { randomBytes } from 'node:crypto'
import { Autowired, HttpException, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { findUserByEmail, issueSession, type AuthResult } from './auth.queries'
import { hashPassword, verifyPassword } from './password'
import { Tokens } from './tokens'
import type { LoginDTO } from './dtos/login.dto'

/**
 * Hashed ONCE at module load, against a random value nobody can supply.
 *
 * The point of a dummy hash is that both branches of `execute` perform the same
 * number of scrypt calls. Hashing on demand did the opposite: the known-email
 * branch ran one scrypt, the unknown-email branch ran two (hash, then verify
 * against it), making unknown emails measurably SLOWER — 37ms vs 58ms in one
 * measurement, 33ms vs 72ms in another. That is precisely the enumeration
 * oracle this exists to close, and login has no rate limit.
 *
 * Guarded by `__tests__/login-timing.test.ts`, which asserts the scrypt call
 * counts structurally rather than by wall clock.
 */
const DUMMY_HASH = hashPassword(randomBytes(32).toString('hex'))

@Service()
export class LoginUseCase {
  constructor(
    @Autowired() private readonly database: Database,
    @Autowired() private readonly tokens: Tokens,
  ) {}

  async execute(dto: LoginDTO): Promise<AuthResult> {
    const user = await findUserByEmail(this.database, dto.email)

    // Both branches run exactly one scrypt: the hit verifies against the stored
    // hash, the miss verifies against DUMMY_HASH (already computed at module
    // load). See the DUMMY_HASH comment for why the previous form was backwards.
    const stored = user?.passwordHash ?? (await DUMMY_HASH)
    const ok = await verifyPassword(dto.password, stored)

    // Identical message either way — a distinct "no such user" would hand out
    // a user-enumeration oracle.
    if (!user || !ok) throw HttpException.unauthorized('Invalid email or password')

    const { rowId: _rowId, ...issued } = await issueSession(this.database, this.tokens, user)
    return issued
  }
}
