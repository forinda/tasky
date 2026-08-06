import { z } from 'zod'

export const createCategorySchema = z.object({
  name: z.string().min(1).max(120),
  // Hex or nothing. A free string here ends up rendered into markup by the
  // client, so it is constrained at the trust boundary rather than downstream.
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour like #4F46E5')
    .optional(),
})

export type CreateCategoryDTO = z.infer<typeof createCategorySchema>
