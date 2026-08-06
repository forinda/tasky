import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import SqliteConnection from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { ConfigService, Inject, Service } from '@forinda/kickjs'
import { schema } from './schema'

// NOTE: better-sqlite3's default export is itself named `Database`. It is
// imported as `SqliteConnection` here so it does not collide with this class.
@Service()
export class Database {
  readonly connection: SqliteConnection.Database
  readonly db: BetterSQLite3Database<typeof schema>

  // `@Value` is declared `PropertyDecorator` in this kickjs version, so it
  // cannot annotate a constructor parameter. Injecting `ConfigService`
  // instead keeps the env dependency explicit and lets a test construct the
  // class directly with `new Database(new ConfigService())`.
  constructor(@Inject(ConfigService) config: ConfigService) {
    const url = config.get('DATABASE_URL')

    if (url !== ':memory:') {
      // better-sqlite3 will not create missing parent directories — it throws
      // SQLITE_CANTOPEN, which reads like a permissions problem rather than a
      // missing folder.
      mkdirSync(dirname(url), { recursive: true })
    }

    this.connection = new SqliteConnection(url)

    // SQLite defaults foreign_keys to OFF. Without this, every ON DELETE and
    // ON UPDATE clause in db/schema/ is silently inert — the restricts would
    // not restrict, and the cascades would leave orphans.
    this.connection.pragma('foreign_keys = ON')
    // WAL lets readers and a writer proceed concurrently. Not supported for
    // in-memory databases, so it is skipped there.
    if (url !== ':memory:') {
      this.connection.pragma('journal_mode = WAL')
    }

    this.db = drizzle(this.connection, { schema })
  }

  close(): void {
    this.connection.close()
  }
}
