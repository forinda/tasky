import { randomUUID } from 'node:crypto'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from './timestamps'

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  ...timestamps,
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
