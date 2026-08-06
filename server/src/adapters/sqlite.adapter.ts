import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createLogger, defineAdapter, getEnv, type AdapterContext } from '@forinda/kickjs'
import { Database } from '../db/database'

const log = createLogger('SqliteAdapter')

// Resolved from this file rather than process.cwd() so migrations are found
// regardless of which directory the process was started from.
//
// Production trusts the copy inside its own bundle: a deploy shipping only
// dist/ + node_modules/ has no src/ to fall back to. Dev and tests prefer the
// source folder, because a stale dist/migrations left over from an earlier
// build would otherwise win silently and apply the wrong schema.
const DIST_MIGRATIONS = resolve(import.meta.dirname, './migrations')
const SRC_MIGRATIONS = resolve(import.meta.dirname, '../db/migrations')

const MIGRATIONS_CANDIDATES =
  getEnv('NODE_ENV') === 'production'
    ? [DIST_MIGRATIONS, SRC_MIGRATIONS]
    : [SRC_MIGRATIONS, DIST_MIGRATIONS]

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
          log.error(`migration failed from ${MIGRATIONS_FOLDER} — refusing to start`, error)

          // Under vitest this code runs inside the test worker. A hard exit
          // there kills the whole run with an opaque "worker exited" error;
          // rethrowing instead surfaces as a normal failing test. In a real
          // process we must still exit, because the framework catches a
          // `beforeStart` throw, logs "Adapter hook failed", and starts the
          // server anyway — serving traffic against an unmigrated database.
          if (getEnv('NODE_ENV') === 'test') throw error

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
