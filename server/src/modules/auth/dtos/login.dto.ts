import { z } from 'zod'

// No `min(8)` on password here, unlike signup: an existing user whose password
// predates a policy change must still be able to log in, and the value is
// checked against the stored hash regardless.
export const loginSchema = z.object({
  // Normalised: SQLite's unique index is BINARY-collated, so without this
  // Victim@x.com and victim@x.com are two accounts for one human — and
  // ownership hangs off users.id.
  email: z.email().max(320).toLowerCase(),
  password: z.string().min(1).max(200),
})

export type LoginDTO = z.infer<typeof loginSchema>
