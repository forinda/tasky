import { z } from 'zod'

export const signupSchema = z.object({
  // Normalised: SQLite's unique index is BINARY-collated, so without this
  // Victim@x.com and victim@x.com are two accounts for one human — and
  // ownership hangs off users.id.
  // Messages are written for the person filling in the form, not for the
  // developer reading a stack trace. Zod's defaults ("Too small: expected
  // string to have >=8 characters") leak the implementation into the UI, and
  // these are the strings the client renders verbatim under each field.
  email: z.email('Enter a valid email address').max(320, 'That email is too long').toLowerCase(),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(200, 'That password is too long'),
  name: z.string().min(1, 'Enter your name').max(200, 'That name is too long'),
})

export type SignupDTO = z.infer<typeof signupSchema>
