import { randomUUID } from 'node:crypto'
import { sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { timestamps } from './timestamps'
import { users } from './users'

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    // A user's categories have independent value — deleting the owning user
    // must fail loudly rather than silently destroying their categories.
    // IDs are UUIDs and aren't expected to change, so onUpdate cascade is a
    // safety net, not a workflow: if one is ever rewritten, references
    // follow instead of breaking.
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    ...timestamps,
  },
  (t) => [unique('categories_owner_name_unq').on(t.ownerId, t.name)],
)

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
