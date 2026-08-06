import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createLogger, defineAdapter, type AdapterContext } from '@forinda/kickjs'
import { Database } from '../db/database'

const log = createLogger('SqliteAdapter')

// Resolved from this file rather than process.cwd() so migrations are found
// regardless of which directory the process was started from.
const MIGRATIONS_CANDIDATES = [
  // Production: `kick build` copies src/db/migrations to dist/migrations, so a
  // deploy shipping only dist/ + node_modules/ is self-contained.
  resolve(import.meta.dirname, './migrations'),
  // Dev and tests: running unbundled from src/adapters/.
  resolve(import.meta.dirname, '../db/migrations'),
]
const MIGRATIONS_FOLDER =
  MIGRATIONS_CANDIDATES.find((path) => existsSync(path)) ?? MIGRATIONS_CANDIDATES[0]

/**
 * Owns the database lifecycle and nothing else — no query logic lives here.
 *
 * ponytail: migrations run on every boot rather than as a gated CLI step,
 * with an explicit `process.exit(1)` on failure — the framework otherwise
 * catches a `beforeStart` throw, logs "Adapter hook failed", and starts the
 * server anyway, which would silently serve traffic against an unmigrated
 * database. Acceptable for a single-file SQLite database; move to a gated
 * CLI step before this ever targets a shared or production database.
 */
export const SqliteAdapter = defineAdapter({
  name: 'SqliteAdapter',
  build: () => {
    let database: Database | undefined

    return {
      beforeStart({ container }: AdapterContext): void {
        database = container.resolve(Database)

        try {
          // Non-null: assigned on the line above, in the same synchronous call.
          migrate(database!.db, { migrationsFolder: MIGRATIONS_FOLDER })
        } catch (error) {
          // The framework catches a throw here, logs "Adapter hook failed",
          // and starts the server anyway — which would serve traffic against
          // an unmigrated database. Exit instead: a process that cannot
          // migrate must not accept requests.
          log.error(`migration failed from ${MIGRATIONS_FOLDER} — refusing to start`, error)
          process.exit(1)
        }
      },

      async shutdown(): Promise<void> {
        database?.close()
        database = undefined
      },
    }
  },
})
