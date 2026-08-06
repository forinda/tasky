# Story 2 — Drizzle Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up SQLite persistence — Drizzle schema for all four tables, a DI-owned `Database` service, and a `SqliteAdapter` that migrates on boot and closes on shutdown.

**Architecture:** `Database` is a `@Service()` singleton owning the `better-sqlite3` connection and the Drizzle instance. `SqliteAdapter` is a thin `defineAdapter()` handling lifecycle only — `migrate()` in `beforeStart`, `close()` in `shutdown`. No query logic anywhere in this story; Stories 3-5 add repositories.

**Tech Stack:** Drizzle ORM 0.45, drizzle-kit 0.31, better-sqlite3 13, KickJS v6 (Express), Vitest.

## Global Constraints

- Package manager is **pnpm**. Never invoke `npm` or `yarn`.
- All commands run from `/home/forinda/Desktop/adero-api` unless a step says otherwise. **Verify with `pwd` before any command whose behavior depends on location** — a `cd server && …` leaves the shell there for every later command, and this has already caused two wrong-directory incidents in this project.
- Read env values with `getEnv('KEY')` from `@forinda/kickjs`. Never a named import from `./config`, never raw `process.env` in application code. (`drizzle.config.ts` is a build-time CLI file, not application code — it is the one exception, see Task 1.)
- `server/src/index.ts` keeps `import './config'` as the first import after `reflect-metadata`, and must end with `export const app = await bootstrap({ ... })`.
- Every new env key goes in the Zod schema at `server/src/config/index.ts`, and into all three of `.env`, `.env.example`, `.env.test`. The schema is re-validated on **every** env reload, so an incomplete `.env` fails later, not at boot.
- `NODE_ENV` has no default and is required — do not add one back.
- `defineAdapter()` factory only — never `class implements AppAdapter`.
- `.kickjs/` is generated and gitignored. Never commit or hand-edit it.
- Adapters are aggregated in `server/src/adapters/index.ts` and passed to `bootstrap()` by name — never inlined into the entry file.

## Story 1 context you need

- The repo is a pnpm workspace: `server/` holds the API, root holds workspace files. `web/` does not exist yet.
- `server/src/` currently contains only `config/index.ts`, `index.ts`, `modules/index.ts`, and `__tests__/smoke.test.ts`. There is no `db/` and no `adapters/` directory yet — you create both.
- `server/src/index.ts` mounts `DevToolsAdapter` and `SwaggerAdapter`, each behind its own `...(isProduction ? [] : [...])` spread. **Keep the two spreads separate** — that is deliberate, so a future adapter can use a different condition.
- `server/package.json`'s `typecheck` script is `kick typegen && tsc --noEmit`. The typegen step is required because `KickEnv` comes from gitignored generated types.
- The only existing test builds its own app via `createTestApp({ modules: [] })` and never imports `server/src/index.ts`. Task 4 closes that gap.

---

## File Structure

| Path | Responsibility |
|---|---|
| `server/src/db/schema.ts` | Four Drizzle tables + inferred row types. No logic. |
| `server/src/db/database.ts` | `@Service() class Database` — owns the connection and Drizzle instance, applies pragmas. |
| `server/src/db/migrations/` | drizzle-kit output. Committed. |
| `server/drizzle.config.ts` | drizzle-kit CLI config. Build-time only. |
| `server/src/adapters/sqlite.adapter.ts` | `defineAdapter()` — migrate on `beforeStart`, close on `shutdown`. Lifecycle only. |
| `server/src/adapters/index.ts` | Adapter aggregation, imported by `server/src/index.ts`. |
| `server/src/db/__tests__/database.test.ts` | Pragmas, FK cascade, `:memory:` isolation. |
| `server/src/__tests__/app.test.ts` | Imports `{ app }` from `../index` — closes the entry-file coverage gap. |

---

### Task 1: Dependencies, config, and env wiring

Nothing here is testable behavior yet — the deliverable is that `better-sqlite3` is actually **built** and loadable, which is the failure mode that looks like a code bug later.

**Files:**
- Modify: `pnpm-workspace.yaml`, `server/package.json`, `server/src/config/index.ts`, `server/.env`, `server/.env.example`, `server/.env.test`, `server/.gitignore`
- Create: `server/drizzle.config.ts`

**Interfaces:**
- Produces: `DATABASE_URL` as a required-with-default env key, readable via `getEnv('DATABASE_URL')`. Task 3 consumes it.

- [ ] **Step 1: Add the `allowBuilds` entry BEFORE installing**

`better-sqlite3` is a native module with a build script. pnpm 10 **silently skips** build scripts for packages not listed in `allowBuilds` — the install reports success, and the failure surfaces much later as `Could not locate the bindings file`, which reads like a code bug.

Edit `pnpm-workspace.yaml` so `allowBuilds` reads:

```yaml
allowBuilds:
  '@scarf/scarf': true
  '@swc/core': true
  'better-sqlite3': true
```

Leave `packages:` and `minimumReleaseAgeExclude` untouched.

- [ ] **Step 2: Install the dependencies**

```bash
cd /home/forinda/Desktop/adero-api
pnpm --filter ./server add drizzle-orm better-sqlite3
pnpm --filter ./server add -D drizzle-kit @types/better-sqlite3
```

- [ ] **Step 3: Prove the native module actually built**

This is the real deliverable of Step 1. Do not skip it.

```bash
cd /home/forinda/Desktop/adero-api/server && node -e "const D=require('better-sqlite3'); const d=new D(':memory:'); d.exec('create table t(x)'); d.prepare('insert into t values (1)').run(); console.log('rows:', d.prepare('select count(*) c from t').get().c); d.close()"; cd /home/forinda/Desktop/adero-api
```

Expected: `rows: 1`.

If it throws `Could not locate the bindings file`, the `allowBuilds` entry did not take effect. Run `pnpm --filter ./server rebuild better-sqlite3` and retry. If it still fails, report BLOCKED with the exact error — do not proceed, because every later task depends on this.

- [ ] **Step 4: Add `DATABASE_URL` to the env schema**

In `server/src/config/index.ts`, add to the `z.object({...})` passed to `fromZod`:

```ts
    DATABASE_URL: z.string().default('./data/adero.db'),
```

Place it after `LOG_LEVEL`. Do not touch `NODE_ENV` — it is deliberately without a default.

- [ ] **Step 5: Add the key to all three env files**

The schema is re-validated on every env reload, so all three must carry it.

`server/.env` and `server/.env.example` — append:
```
DATABASE_URL=./data/adero.db
```

`server/.env.test` — append (an in-memory DB means each test run starts clean with no file cleanup):
```
DATABASE_URL=:memory:
```

- [ ] **Step 6: Ignore SQLite artifacts**

WAL mode creates three files on first boot. Append to `server/.gitignore`:

```
# SQLite — WAL mode creates all three on first boot
*.db
*.db-wal
*.db-shm
data/
```

- [ ] **Step 7: Create `server/drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

// Build-time CLI config — NOT application code. drizzle-kit runs this in its
// own process before the app (and therefore the env schema) has loaded, so
// reading process.env directly here is correct; `getEnv` is unavailable.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './data/adero.db',
  },
})
```

- [ ] **Step 8: Add the drizzle-kit scripts**

In `server/package.json`, add to `scripts`:

```json
    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio",
```

There is deliberately **no** `db:migrate` script — `SqliteAdapter` migrates on boot (Task 4).

- [ ] **Step 9: Verify nothing regressed**

```bash
cd /home/forinda/Desktop/adero-api
pnpm run typecheck
pnpm run test
```

Expected: both pass, tests 2/2 pristine.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: add drizzle, better-sqlite3, and DATABASE_URL wiring"
```

---

### Task 2: Schema and first migration

**Files:**
- Create: `server/src/db/schema.ts`, `server/src/db/migrations/` (generated)

**Interfaces:**
- Consumes: `DATABASE_URL` from Task 1.
- Produces: `users`, `tasks`, `categories`, `taskCategories` table objects, and the row types `User`, `NewUser`, `Task`, `NewTask`, `Category`, `NewCategory`. Tasks 3-4 and Stories 3-5 import these.

- [ ] **Step 1: Write the schema**

Create `server/src/db/schema.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

// Timestamps use integer({ mode: 'timestamp_ms' }) because SQLite has no date
// type; this mode hands back real Date objects on read.
const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
}

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  ...timestamps,
})

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    ...timestamps,
  },
  (t) => [unique('categories_owner_name_unq').on(t.ownerId, t.name)],
)

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    // SQLite has no enum. $type<> gives the compile-time union; the Zod
    // request schemas enforce it at the boundary.
    priority: text('priority').$type<'low' | 'medium' | 'high'>().notNull().default('medium'),
    status: text('status').$type<'todo' | 'in_progress' | 'done'>().notNull().default('todo'),
    ...timestamps,
  },
  (t) => [index('tasks_owner_idx').on(t.ownerId)],
)

// No ownerId here: both sides already cascade from users, and a join row can
// only be written between a task and a category the same user owns — enforced
// at write time in Story 5.
export const taskCategories = sqliteTable(
  'task_categories',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.categoryId] })],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert

export const schema = { users, categories, tasks, taskCategories }
```

`schema` is the object form Drizzle's `drizzle(connection, { schema })` expects — Task 3 passes it so the query builder knows the table set.

- [ ] **Step 2: Typecheck the schema before generating**

```bash
cd /home/forinda/Desktop/adero-api
pnpm run typecheck
```

Expected: passes. A schema error here produces a much clearer message than a drizzle-kit failure.

- [ ] **Step 3: Generate the first migration**

```bash
cd /home/forinda/Desktop/adero-api && pnpm --filter ./server run db:generate
```

Expected: drizzle-kit reports creating a migration, and `server/src/db/migrations/` now contains a `.sql` file plus a `meta/` directory.

- [ ] **Step 4: Read the generated SQL and confirm it matches the intent**

```bash
cat server/src/db/migrations/*.sql
```

Confirm all four `CREATE TABLE` statements exist, that the three foreign keys carry `ON DELETE cascade`, that `categories` has a unique constraint on `(owner_id, name)`, and that `task_categories` has a composite primary key.

If any cascade is missing, the `references(..., { onDelete: 'cascade' })` calls did not take — fix the schema and regenerate rather than hand-editing the SQL.

- [ ] **Step 5: Confirm the migration is tracked**

```bash
git status --short server/src/db/migrations
```

Expected: the `.sql` and `meta/` files appear as untracked/new. Migration SQL is committed — it is the schema's history.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add drizzle schema for users, tasks, categories, and join table"
```

---

### Task 3: The `Database` service

**Files:**
- Create: `server/src/db/database.ts`, `server/src/db/__tests__/database.test.ts`

**Interfaces:**
- Consumes: `schema` and the table objects from Task 2; `DATABASE_URL` from Task 1.
- Produces: `@Service() class Database` with a readonly `db` (Drizzle instance), a readonly `connection` (raw `better-sqlite3`), and `close(): void`. Task 4 and every repository in Stories 3-5 inject it by type via `@Autowired()`.

- [ ] **Step 1: Write the failing test**

Create `server/src/db/__tests__/database.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { resolve } from 'node:path'
import { Database } from '../database'
import { users, tasks } from '../schema'

const MIGRATIONS = resolve(import.meta.dirname, '../migrations')

let open: Database | undefined

afterEach(() => {
  open?.close()
  open = undefined
})

function freshDb(): Database {
  const database = new Database(':memory:')
  migrate(database.db, { migrationsFolder: MIGRATIONS })
  open = database
  return database
}

describe('Database', () => {
  it('enables foreign key enforcement', () => {
    const database = freshDb()

    const [{ foreign_keys: fk }] = database.connection
      .prepare('PRAGMA foreign_keys')
      .all() as Array<{ foreign_keys: number }>

    expect(fk).toBe(1)
  })

  it('cascades task deletion when its owner is removed', () => {
    const database = freshDb()

    database.db.insert(users).values({
      id: 'u1',
      email: 'a@example.com',
      passwordHash: 'x',
      name: 'A',
    }).run()

    database.db.insert(tasks).values({ id: 't1', ownerId: 'u1', title: 'Ship' }).run()

    expect(database.db.select().from(tasks).all()).toHaveLength(1)

    database.db.delete(users).where(eq(users.id, 'u1')).run()

    expect(database.db.select().from(tasks).all()).toHaveLength(0)
  })

  it('rejects a task whose owner does not exist', () => {
    const database = freshDb()

    expect(() =>
      database.db.insert(tasks).values({ id: 't2', ownerId: 'ghost', title: 'Orphan' }).run(),
    ).toThrow(/FOREIGN KEY/i)
  })
})
```

The second and third cases are the ones that matter. SQLite ships with foreign keys **off by default**, so without the pragma every `onDelete: 'cascade'` in the schema is decorative and the third case would silently succeed.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/forinda/Desktop/adero-api
pnpm --filter ./server exec vitest run src/db/__tests__/database.test.ts
```

Expected: FAIL — cannot resolve `../database`, which does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `server/src/db/database.ts`:

```ts
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import SqliteConnection from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { Service, Value } from '@forinda/kickjs'
import { schema } from './schema'

// NOTE: better-sqlite3's default export is itself named `Database`. It is
// imported as `SqliteConnection` here so it does not collide with this class.
@Service()
export class Database {
  readonly connection: SqliteConnection.Database
  readonly db: BetterSQLite3Database<typeof schema>

  constructor(@Value('DATABASE_URL') url: string) {
    if (url !== ':memory:') {
      // better-sqlite3 will not create missing parent directories — it throws
      // SQLITE_CANTOPEN, which reads like a permissions problem rather than a
      // missing folder.
      mkdirSync(dirname(url), { recursive: true })
    }

    this.connection = new SqliteConnection(url)

    // SQLite defaults foreign_keys to OFF. Without this, every
    // `onDelete: 'cascade'` in schema.ts is silently inert.
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
```

`@Value('DATABASE_URL')` is a property-or-parameter decorator, so the constructor form above is valid and keeps the class directly constructible in tests (`new Database(':memory:')`) while DI supplies the env value in production.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /home/forinda/Desktop/adero-api
pnpm --filter ./server exec vitest run src/db/__tests__/database.test.ts
```

Expected: PASS, 3 tests.

If the cascade test fails but the pragma test passes, the migration SQL is missing its `ON DELETE cascade` clauses — return to Task 2 Step 4.

- [ ] **Step 5: Run the full suite and typecheck**

```bash
pnpm run typecheck
pnpm run test
```

Expected: both pass, 5 tests total (2 smoke + 3 database), output pristine.

- [ ] **Step 6: Confirm no stray database files appeared**

```bash
git status --short
```

Expected: only `server/src/db/database.ts` and the new test as new files. Expected **absent**: any `*.db`, `*.db-wal`, `*.db-shm`, or `data/`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Database service with foreign-key and WAL pragmas"
```

---

### Task 4: `SqliteAdapter`, adapter aggregation, and entry-file coverage

**Files:**
- Create: `server/src/adapters/sqlite.adapter.ts`, `server/src/adapters/index.ts`, `server/src/__tests__/app.test.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `Database` from Task 3.
- Produces: `SqliteAdapter()` (a `defineAdapter` factory — call it with parens when mounting) and `adapters` from `server/src/adapters/index.ts`, which `server/src/index.ts` passes to `bootstrap()`.

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/app.test.ts`. Nothing currently imports the entry file, so its adapter list and production gate have zero coverage.

```ts
import { describe, it, expect } from 'vitest'
import { app } from '../index'

describe('application entry', () => {
  it('exports a bootstrapped app', () => {
    expect(app).toBeDefined()
  })

  it('has run its migrations, so schema tables exist', async () => {
    const { Database } = await import('../db/database')
    const database = app.container.resolve(Database)

    const names = database.connection
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>

    const tableNames = names.map((r) => r.name)

    expect(tableNames).toContain('users')
    expect(tableNames).toContain('tasks')
    expect(tableNames).toContain('categories')
    expect(tableNames).toContain('task_categories')
  })
})
```

`.env.test` sets `DATABASE_URL=:memory:`, so this exercises the real boot path against a throwaway database.

**If `app.container` is not the accessor** — check the `Application` class surface and use whatever exposes the DI container. Do not fabricate an API; if you cannot find one, report BLOCKED naming what you inspected.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/forinda/Desktop/adero-api
pnpm --filter ./server exec vitest run src/__tests__/app.test.ts
```

Expected: FAIL — the tables do not exist, because nothing migrates yet.

- [ ] **Step 3: Write the adapter**

Create `server/src/adapters/sqlite.adapter.ts`:

```ts
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { defineAdapter, type AdapterContext } from '@forinda/kickjs'
import { Database } from '../db/database'

// Resolved from this file rather than process.cwd() so migrations are found
// regardless of which directory the process was started from.
const MIGRATIONS_FOLDER = resolve(import.meta.dirname, '../db/migrations')

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
        migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER })
      },

      async shutdown(): Promise<void> {
        database?.close()
        database = undefined
      },
    }
  },
})
```

- [ ] **Step 4: Write the adapter aggregation**

Create `server/src/adapters/index.ts`. This is what keeps the entry file thin — the project rule is that adapters are aggregated in their own folder and passed to `bootstrap()` by name.

```ts
import { SwaggerAdapter } from '@forinda/kickjs-swagger'
import { DevToolsAdapter } from '@forinda/kickjs-devtools'
import { getEnv } from '@forinda/kickjs'
import { SqliteAdapter } from './sqlite.adapter'

const isProduction = getEnv('NODE_ENV') === 'production'

export const adapters = [
  // Persistence is required in every environment.
  SqliteAdapter(),
  // DevTools exposes the route table, DI graph, and adapter list with no
  // auth (`secret: false`). Never mount it in production.
  ...(isProduction ? [] : [DevToolsAdapter({ secret: false })]),
  // Swagger mounts /docs, /redoc, and /openapi.json — the full API surface
  // described in one place. Development only.
  ...(isProduction
    ? []
    : [
        SwaggerAdapter({
          info: {
            title: 'Adero API',
            description: 'Adero API',
            version: '1.0.0',
          },
        }),
      ]),
]
```

Keep the two gated spreads separate — that is deliberate, so a future adapter can use a different condition.

- [ ] **Step 5: Slim the entry file**

Replace `server/src/index.ts` with:

```ts
import 'reflect-metadata'
// Side-effect import — registers the extended env schema with kickjs
// **before** any controller / service / @Value gets resolved. Without
// this line ConfigService.get('YOUR_KEY') returns undefined because the
// cached schema would still be the base shape.
import './config'
import { bootstrap, expressRuntime } from '@forinda/kickjs'
import { adapters } from './adapters'
import { modules } from './modules'

// Export the app for the Vite plugin (dev mode) and createTestApp.
export const app = await bootstrap({
  modules,
  runtime: expressRuntime(),
  adapters,
})
```

The `isProduction` const and both adapter definitions move to `adapters/index.ts`. `import './config'` stays first after `reflect-metadata`, and the file still ends with the `export const app` bootstrap.

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd /home/forinda/Desktop/adero-api
pnpm --filter ./server exec vitest run src/__tests__/app.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 7: Run the full suite and typecheck**

```bash
pnpm run typecheck
pnpm run test
```

Expected: both pass, 7 tests total (2 smoke + 3 database + 2 app), output pristine.

- [ ] **Step 8: Verify the dev server boots and creates the database file**

```bash
cd /home/forinda/Desktop/adero-api
timeout 25 pnpm run dev:server 2>&1 | tail -20
ls -la server/data/ 2>/dev/null
```

Expected: the server logs a listening line with no migration errors (`timeout` killing it is success), and `server/data/` contains `adero.db` plus WAL sidecar files.

- [ ] **Step 9: Verify the production gate still holds with the adapter list refactored**

The adapters moved to a new file; confirm the gating survived the move.

```bash
cd /home/forinda/Desktop/adero-api
pnpm --filter ./server build
(cd server && NODE_ENV=production PORT=3120 timeout 25 node dist/index.js > /tmp/story2-prod.log 2>&1 &)
sleep 9
for p in /_debug /docs /redoc /openapi.json; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3120$p)"
done
tail -5 /tmp/story2-prod.log
```

Expected: all four return **404**, and the log shows a clean startup — the production build migrates and serves with only `SqliteAdapter` mounted.

- [ ] **Step 10: Verify the connection closes cleanly on shutdown**

The story requires "closes clean", and `shutdown()` is the one adapter hook nothing above exercises. A connection left open holds the WAL lock.

Append this case to `server/src/__tests__/app.test.ts`:

```ts
  it('closes the database connection on shutdown', async () => {
    const { Database } = await import('../db/database')
    const database = app.container.resolve(Database)

    await app.shutdown()

    expect(() => database.connection.prepare('SELECT 1').get()).toThrow(/closed/i)
  })
```

Place it **last** in the file — it tears down the shared `app`, so any case after it would run against a closed database. If `Application` exposes no `shutdown()`, inspect the class and use the actual teardown method; report BLOCKED rather than inventing one.

Then re-run the suite:

```bash
cd /home/forinda/Desktop/adero-api
pnpm run test
```

Expected: 8 tests, all passing, output pristine.

- [ ] **Step 11: Confirm no database artifacts are staged**

```bash
git status --short
```

Expected **absent**: `server/data/`, any `*.db`, `*.db-wal`, `*.db-shm`, `server/dist/`, `server/.kickjs/`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add SqliteAdapter, aggregate adapters, and cover the entry file"
```

---

## Done when

- [ ] `pnpm run typecheck` passes from the repo root.
- [ ] `pnpm run test` passes with 8 tests, output pristine.
- [ ] `pnpm run dev:server` boots, migrates, and creates `server/data/adero.db`.
- [ ] A production build serves with `/_debug`, `/docs`, `/redoc`, `/openapi.json` all 404.
- [ ] Deleting a user cascades to their tasks; inserting a task with an unknown `ownerId` throws.
- [ ] `server/src/index.ts` contains no adapter literals — they live in `server/src/adapters/index.ts`.
- [ ] `git status` is clean of `*.db`, `*.db-wal`, `*.db-shm`, and `data/`.

## Deliberately not in this story

- No repositories, services, or controllers — Stories 3-5.
- No `Container.create()` isolation patterns — introduced with the first repository in Story 3.
- No seed data.
- `taskCategories` has no inferred row types exported; nothing needs them until Story 5.

## Carried forward to Story 3

- **`onNotFound` does not emit RFC 9457.** An unmatched route returns `{"message":"Not Found"}` with `content-type: application/json`, which will diverge from `ctx.problem.*` the moment real routes exist. See `plan.md` §16b.
- **Whether the built-in `onError` leaks stack traces in production is unverified** — untestable until a route can throw. Make it an explicit acceptance item on Story 3, not a background note.
- **`ColumnQueryFieldConfig` is exported from `@forinda/kickjs/query`**, not the package root. Story 5's list endpoint imports from that subpath.
