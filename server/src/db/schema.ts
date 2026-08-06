import { randomUUID } from 'node:crypto'
import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

// Timestamps use integer({ mode: 'timestamp_ms' }) because SQLite has no date
// type; this mode hands back real Date objects on read.
const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
}

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  ...timestamps,
})

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
    priority: text('priority').$type<'low' | 'medium' | 'high'>().notNull().default('medium'),
    status: text('status').$type<'todo' | 'in_progress' | 'done'>().notNull().default('todo'),
    ...timestamps,
  },
  (t) => [index('tasks_owner_idx').on(t.ownerId)],
)

// No ownerId here: both sides already cascade from users, and a join row can
// only be written between a task and a category the same user owns — enforced
// at write time in Story 5.
export const taskCategories = sqliteTable(
  'task_categories',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.categoryId] })],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert

export const schema = { users, categories, tasks, taskCategories }
