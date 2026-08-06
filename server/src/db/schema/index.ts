export { TASK_PRIORITIES, TASK_STATUSES } from './enums'
export type { TaskPriority, TaskStatus } from './enums'

export { categories } from './categories'
export type { Category, NewCategory } from './categories'

export { taskCategories } from './task-categories'

export { tasks } from './tasks'
export type { Task, NewTask } from './tasks'

export { users } from './users'
export type { User, NewUser } from './users'

import { categories } from './categories'
import { taskCategories } from './task-categories'
import { tasks } from './tasks'
import { users } from './users'

export const schema = { users, categories, tasks, taskCategories }
