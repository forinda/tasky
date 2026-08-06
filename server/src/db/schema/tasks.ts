import { randomUUID } from 'node:crypto'
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { TaskPriority, TaskStatus } from './enums'
import { timestamps } from './timestamps'
import { users } from './users'

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    // SQLite has no enum. $type<> gives the compile-time union; the Zod
    // request schemas enforce it at the boundary.
    priority: text('priority').$type<TaskPriority>().notNull().default('medium'),
    status: text('status').$type<TaskStatus>().notNull().default('todo'),
    ...timestamps,
  },
  (t) => [index('tasks_owner_idx').on(t.ownerId)],
)

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
