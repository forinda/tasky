import { Autowired, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { findRefreshTokenByHash, revokeRefreshTokenFamily } from './auth.queries'
import { hashRefreshToken } from './tokens'

@Service()
export class LogoutUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  /** Idempotent by design: signing out twice is not an error worth reporting. */
  async execute(presented: string | undefined): Promise<void> {
    if (!presented) return
    const row = await findRefreshTokenByHash(this.database, hashRefreshToken(presented))
    if (row) await revokeRefreshTokenFamily(this.database, row.familyId)
  }
}
