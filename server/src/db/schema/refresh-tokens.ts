import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from './timestamps'
import { users } from './users'

export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    // CASCADE, unlike tasks.ownerId and categories.ownerId which are RESTRICT.
    // The rule from plan.md §5 is about independent value: a user's tasks are
    // worth protecting from an accidental account delete, a refresh token is
    // worth nothing without its user. Same reasoning as the task_categories
    // join rows.
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // Every token minted from one login shares a family. Rotation replaces a
    // token with its successor inside the family; presenting a token that was
    // already rotated away means a replay, and the whole family dies.
    familyId: text('family_id').notNull(),
    // sha256 of the token, never the token. A database dump then contains
    // nothing that can be presented to /auth/refresh.
    //
    // Plain sha256 rather than scrypt is right here and wrong for passwords:
    // this is 256 bits of uniform randomness with no dictionary to run against
    // it, so a slow KDF would buy nothing and cost a hash on every request.
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    // Null means live. Set on rotation and on revocation alike — what
    // distinguishes them is whether `replacedById` was also set.
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    // The successor issued when this token was rotated. Self-referencing FKs
    // are declared with an explicit callback so the table can reference itself
    // before it is fully defined.
    replacedById: text('replaced_by_id'),
    ...timestamps,
  },
  (t) => [
    index('refresh_tokens_user_idx').on(t.userId),
    index('refresh_tokens_family_idx').on(t.familyId),
  ],
)

export type RefreshToken = typeof refreshTokens.$inferSelect
export type NewRefreshToken = typeof refreshTokens.$inferInsert
