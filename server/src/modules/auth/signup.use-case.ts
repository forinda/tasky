import { Autowired, HttpException, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { createUser, issueSession, type AuthResult } from './auth.queries'
import { hashPassword } from './password'
import { Tokens } from './tokens'
import type { SignupDTO } from './dtos/signup.dto'

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
export class SignupUseCase {
  constructor(
    @Autowired() private readonly database: Database,
    @Autowired() private readonly tokens: Tokens,
  ) {}

  async execute(dto: SignupDTO): Promise<AuthResult> {
    // No pre-check. A `findUserByEmail` before the insert is a check-then-insert
    // race with a ~30ms scrypt yield in the middle: five concurrent identical
    // signups all passed it, and the four losers hit the raw driver error and
    // fell out as 500s carrying the SQL text and a stack trace. The database
    // constraint is the only authority that cannot lose that race.
    try {
      const user = await createUser(this.database, {
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        name: dto.name,
      })

      const { rowId: _rowId, ...issued } = await issueSession(this.database, this.tokens, user)
      return issued
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw HttpException.conflict('Email already registered')
      }
      throw error
    }
  }
}
