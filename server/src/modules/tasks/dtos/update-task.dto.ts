import { z } from 'zod'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/db/schema'

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    // Present means "replace the set with exactly this"; absent means "leave
    // the links alone". `[]` is therefore meaningfully different from omitted.
    categoryIds: z.array(z.string().min(1)).max(20).optional(),
  })
  // An empty patch is a client bug, not a no-op success.
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Provide at least one field to update',
  })

export type UpdateTaskDTO = z.infer<typeof updateTaskSchema>
