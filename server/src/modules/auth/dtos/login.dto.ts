import { z } from 'zod'

// No `min(8)` on password here, unlike signup: an existing user whose password
// predates a policy change must still be able to log in, and the value is
// checked against the stored hash regardless.
export const loginSchema = z.object({
  // Normalised: SQLite's unique index is BINARY-collated, so without this
  // Victim@x.com and victim@x.com are two accounts for one human — and
  // ownership hangs off users.id.
  email: z.email('Enter a valid email address').max(320, 'That email is too long').toLowerCase(),
  password: z.string().min(1, 'Enter your password').max(200, 'That password is too long'),
})

export type LoginDTO = z.infer<typeof loginSchema>
