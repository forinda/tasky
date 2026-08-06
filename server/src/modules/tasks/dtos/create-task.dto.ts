import { z } from 'zod'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/db/schema'

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  // Built from the same const arrays the column's $type<> uses — one source of
  // truth, so adding a status cannot leave the boundary behind.
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  // A bound on how much work one request can cause, not a business rule.
  categoryIds: z.array(z.string().min(1)).max(20).optional(),
})

export type CreateTaskDTO = z.infer<typeof createTaskSchema>
