import { randomUUID } from 'node:crypto'
import { sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { timestamps } from './timestamps'
import { users } from './users'

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    ...timestamps,
  },
  (t) => [unique('categories_owner_name_unq').on(t.ownerId, t.name)],
)

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
