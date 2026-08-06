import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { defineAdapter, type AdapterContext } from '@forinda/kickjs'
import { Database } from '../db/database'

// Resolved from this file rather than process.cwd() so migrations are found
// regardless of which directory the process was started from.
//
// Two candidates because the file lives at a different depth depending on
// how it's run: unbundled (`src/adapters/sqlite.adapter.ts`, dev/tests) sits
// one level below `src/db/migrations`'s parent; the production build
// (`kick build`) bundles this file down into a flat `dist/index.js`, which
// the Vite build does not copy `src/db/migrations` alongside — so the same
// relative offset from `dist/` misses. Both candidates are checked and the
// first that exists on disk wins.
const MIGRATIONS_CANDIDATES = [
  resolve(import.meta.dirname, '../db/migrations'), // dev: src/adapters -> src/db/migrations
  resolve(import.meta.dirname, '../src/db/migrations'), // prod: dist -> src/db/migrations
]
const MIGRATIONS_FOLDER =
  MIGRATIONS_CANDIDATES.find((path) => existsSync(path)) ?? MIGRATIONS_CANDIDATES[0]

/**
 * Owns the database lifecycle and nothing else — no query logic lives here.
 *
 * ponytail: migrations run on every boot rather than as a gated CLI step. A bad
 * migration takes the process down at startup instead of failing a deliberate
 * command. Acceptable for a single-file SQLite database; move to a gated step
 * before this ever points at a shared or production database.
 */
export const SqliteAdapter = defineAdapter({
  name: 'SqliteAdapter',
  build: () => {
    let database: Database | undefined

    return {
      beforeStart({ container }: AdapterContext): void {
        database = container.resolve(Database)
        // Non-null: assigned on the line above, in the same synchronous call.
        migrate(database!.db, { migrationsFolder: MIGRATIONS_FOLDER })
      },

      async shutdown(): Promise<void> {
        database?.close()
        database = undefined
      },
    }
  },
})
