import { z } from 'zod'

export const signupSchema = z.object({
  // Normalised: SQLite's unique index is BINARY-collated, so without this
  // Victim@x.com and victim@x.com are two accounts for one human — and
  // ownership hangs off users.id.
  email: z.email().max(320).toLowerCase(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(200),
})

export type SignupDTO = z.infer<typeof signupSchema>
