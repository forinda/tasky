export { TASK_PRIORITIES, TASK_STATUSES } from './enums'
export type { TaskPriority, TaskStatus } from './enums'

export { categories } from './categories'
export type { Category, NewCategory } from './categories'

export { taskCategories } from './task-categories'

export { tasks } from './tasks'
export type { Task, NewTask } from './tasks'

export { users } from './users'
export type { User, NewUser } from './users'

export {
  categoriesRelations,
  taskCategoriesRelations,
  tasksRelations,
  usersRelations,
} from './relations'

import { categories } from './categories'
import { taskCategories } from './task-categories'
import { tasks } from './tasks'
import { users } from './users'
import {
  categoriesRelations,
  taskCategoriesRelations,
  tasksRelations,
  usersRelations,
} from './relations'

// Relations belong in the same object passed to `drizzle(connection, { schema })`
// — without them `db.query` cannot traverse, even though the FKs exist.
export const schema = {
  users,
  categories,
  tasks,
  taskCategories,
  usersRelations,
  categoriesRelations,
  tasksRelations,
  taskCategoriesRelations,
}
