import { Autowired, HttpException, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import {
  findRefreshTokenByHash,
  findUserById,
  issueSession,
  revokeRefreshToken,
  revokeRefreshTokenFamily,
  type AuthResult,
} from './auth.queries'
import { Tokens, hashRefreshToken } from './tokens'

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
@Service()
export class RefreshUseCase {
  constructor(
    @Autowired() private readonly database: Database,
    @Autowired() private readonly tokens: Tokens,
  ) {}

  async execute(presented: string): Promise<AuthResult> {
    const invalid = () => HttpException.unauthorized('Invalid or expired session')

    const row = await findRefreshTokenByHash(this.database, hashRefreshToken(presented))
    if (!row) throw invalid()

    if (row.revokedAt) {
      await revokeRefreshTokenFamily(this.database, row.familyId)
      throw invalid()
    }

    if (row.expiresAt.getTime() <= Date.now()) throw invalid()

    const user = await findUserById(this.database, row.userId)
    // The FK is ON DELETE cascade, so this should be unreachable. Treated as a
    // failed refresh rather than a 500 because the caller's next move is the
    // same either way: sign in again.
    if (!user) throw invalid()

    const { rowId, ...issued } = await issueSession(
      this.database,
      this.tokens,
      user,
      row.familyId,
    )
    await revokeRefreshToken(this.database, row.id, rowId)

    return issued
  }
}
