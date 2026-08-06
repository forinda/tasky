import { z } from 'zod'

export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour like #4F46E5')
      .nullable()
      .optional(),
  })
  // An empty patch is a client bug, not a no-op success. Without this it would
  // return 200 having changed nothing, which is indistinguishable from working.
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Provide at least one field to update',
  })

export type UpdateCategoryDTO = z.infer<typeof updateCategorySchema>
