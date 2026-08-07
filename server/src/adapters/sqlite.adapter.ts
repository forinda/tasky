import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createLogger, defineAdapter, getEnv, type AdapterContext } from '@forinda/kickjs'
import { Database } from '../db/database'

const log = createLogger('SqliteAdapter')

// `import.meta.dirname` is `<server>/dist` in the bundle and
// `<server>/src/adapters` when running unbundled (dev, vitest).
// Production reads the copy `kick build` places inside the bundle; dev and
// tests read the source folder, so a stale dist/ can never silently apply an
// outdated schema. There is deliberately no cross-fallback: each environment
// has exactly one correct location, and a miss should fail loudly rather than
// quietly reach for the other one.
// Resolved by which directory this file is ACTUALLY in, not by NODE_ENV.
// The previous env-based branch assumed non-production meant unbundled, so
// running the built artifact with NODE_ENV=development resolved
// `../db/migrations` from dist/ — i.e. server/db/migrations, which does not
// exist — and the boot failed closed for the wrong reason.
//
// Only one candidate can exist at a time, so staleness is impossible: from
// src/adapters the dist candidate resolves to src/adapters/migrations (never
// there), and from dist/ the src candidate resolves to server/db/migrations
// (never there).
const DIST_MIGRATIONS = resolve(import.meta.dirname, './migrations')
const SRC_MIGRATIONS = resolve(import.meta.dirname, '../db/migrations')
const MIGRATIONS_FOLDER = existsSync(SRC_MIGRATIONS) ? SRC_MIGRATIONS : DIST_MIGRATIONS

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

          // The framework catches every `beforeStart` throw (logs "Adapter
          // hook failed" and starts the server anyway), which is why
          // production needs the explicit exit below. Under vitest a hard
          // exit would kill the worker instead, so we rethrow and accept
          // that the caught error goes nowhere useful — with LOG_LEVEL=silent
          // in .env.test, not even the log line survives. The real signal is
          // the table assertion in app.test.ts: a bare "no such table" there
          // means check migrations first.
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
