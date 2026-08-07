import { relations } from 'drizzle-orm'
import { categories } from './categories'
import { taskCategories } from './task-categories'
import { tasks } from './tasks'
import { users } from './users'

/**
 * Declared for Drizzle's relational query API — `db.query.tasks.findMany({ with:
 * { taskCategories: true } })`, which Story 6's `/tasks/grouped` needs.
 *
 * The foreign keys already exist in the schema; these are not a substitute.
 * An FK constrains the data, `relations()` describes the shape so the query
 * builder knows how to traverse it. Adding these emits no migration.
 */
export const usersRelations = relations(users, ({ many }) => ({
  tasks: many(tasks),
  categories: many(categories),
}))

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  owner: one(users, { fields: [tasks.ownerId], references: [users.id] }),
  taskCategories: many(taskCategories),
}))

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  owner: one(users, { fields: [categories.ownerId], references: [users.id] }),
  taskCategories: many(taskCategories),
}))

export const taskCategoriesRelations = relations(taskCategories, ({ one }) => ({
  task: one(tasks, { fields: [taskCategories.taskId], references: [tasks.id] }),
  category: one(categories, {
    fields: [taskCategories.categoryId],
    references: [categories.id],
  }),
}))
