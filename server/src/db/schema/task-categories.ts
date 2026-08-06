import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { categories } from './categories'
import { tasks } from './tasks'

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
