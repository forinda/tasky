import { integer } from 'drizzle-orm/sqlite-core'

// Timestamps use integer({ mode: 'timestamp_ms' }) because SQLite has no date
// type; this mode hands back real Date objects on read.
export const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
}
