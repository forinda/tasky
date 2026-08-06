import { z } from 'zod'

export const signupSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(200),
})

export type SignupDTO = z.infer<typeof signupSchema>
