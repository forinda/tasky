import { and, eq, isNull, lt } from 'drizzle-orm'
import { Autowired, Repository } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { refreshTokens, type RefreshToken } from '@/db/schema'

export interface CreateRefreshTokenInput {
  userId: string
  familyId: string
  tokenHash: string
  expiresAt: Date
}

/** The only place in the app that touches the `refresh_tokens` table. */
@Repository()
export class RefreshTokensRepository {
  constructor(@Autowired() private readonly database: Database) {}

  async create(input: CreateRefreshTokenInput): Promise<RefreshToken> {
    const [row] = this.database.db.insert(refreshTokens).values(input).returning().all()
    return row
  }

  /** Looked up by hash because the plaintext is never stored. */
  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const [row] = this.database.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .all()
    return row ?? null
  }

  /** Rotation: mark spent and point at the successor, for auditing a chain. */
  async revoke(id: string, replacedById: string | null): Promise<void> {
    this.database.db
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
  async revokeFamily(familyId: string): Promise<void> {
    this.database.db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
      .run()
  }

  /** Housekeeping. Nothing calls this on a schedule yet. */
  async deleteExpired(now: Date = new Date()): Promise<void> {
    this.database.db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now)).run()
  }
}
