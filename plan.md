# Adero — Task App Design

**Date:** 2026-08-06
**Status:** approved, ready for implementation planning

A Jira-lite task product: a marketing landing page, email/password auth, and a
kanban board. Users sign up and manage their own tasks — title, description,
priority, status — grouped into categories.

The repo becomes a pnpm workspace: `server/` (KickJS v6 on Express, SQLite via
Drizzle) and `web/` (React + Vite SPA), mirroring the layout of the sibling
`adero-fullstack` project. In production the server serves the built SPA; in
development Vite proxies to the server.

---

## 1. Starting point

`adero-api` is a fresh KickJS scaffold at the repo root. One `users` module
backed by an in-memory `Map` (fields: `name`, `isAdult`, `gender` — nothing
auth-related), plus five inert placeholder files:

| File | State |
|---|---|
| `src/adapters/my-adapter.adapter.ts` | All hooks commented out; the one live entry has `phase: ''`, which is not a valid `MiddlewarePhase` |
| `src/plugins/my-plugin.plugin.ts` | Every hook empty, never registered in `bootstrap()` |
| `src/guards/my-guard.guard.ts` | 401 stub, wired onto `GET /users` |
| `src/middleware/md-ware.middleware.ts` | No-op, mounted globally |
| `src/contributors/authorize.contributor.ts` | `resolve()` throws `"not implemented"` |

Only `SwaggerAdapter` and `DevToolsAdapter` do real work; both stay.

`pnpm-workspace.yaml` exists but carries only `allowBuilds` and
`minimumReleaseAgeExclude` — there is no `packages:` key, so this is not yet a
workspace.

The scaffold `users` module is deleted rather than ported — it shares no fields
with the auth-bearing `users` table this design needs.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Repo shape | pnpm workspace, `server/` + `web/` | Matches `adero-fullstack`; two deployable units, one lockfile |
| API client | `@forinda/kickjs-client` | Types come from `kick typegen`, so routes and payloads cannot drift |
| Scaffold placeholders | Delete all five | Dead code with a latent bug in the adapter |
| Auth | JWT access token | Stateless, no session table, standard for an API |
| Password hashing | `node:crypto` scrypt | Memory-hard, stdlib, zero dependencies |
| Task visibility | Owner only | Every query scoped to the current user |
| Categories | Per-user | Unique on `(ownerId, name)` |
| Task ↔ category | Many-to-many | Tasks carry several labels, Jira-style |
| Status / priority | `todo\|in_progress\|done`, `low\|medium\|high` | Smallest set that models a real board |
| Migrations | Auto on boot | Zero-step dev on a single-file SQLite DB |
| Grouping | Nested route **and** grouped payload | Drill-down plus board view |
| Repository shape | Concrete classes, no interfaces, no DI tokens | Types come from Drizzle inference |
| Frontend | React + Vite SPA, served by `SpaAdapter` | One process, one deploy, real framework for the board |
| Landing direction | ClickUp-sassy | Punchy headline, bold accent, gradient product shot |

---

# Part I — API

## 3. Interfaces and DI

The scaffold routes every repository through an `IUsersRepository` interface and
a `createToken()` binding. Both go away.

Drizzle's `$inferSelect` already produces an exact row type from the schema, so a
hand-maintained interface is a second source of truth that drifts from the first.
Repositories become plain `@Repository()` classes injected by type:

```ts
@Service()
export class TasksService {
  @Autowired() private readonly repo!: TasksRepository
}
```

The chain is `@Controller` → `@Autowired() TasksService` → `@Autowired()
TasksRepository` → `@Autowired() Database`, every hop a concrete class. Modules
drop their `register()` hook entirely — there is nothing left to bind.
`import.meta.glob(..., { eager: true })` stays; it is what fires the decorators.

Zod schemas remain for request bodies (validation plus OpenAPI generation), but
they are no longer the type source for responses.

## 4. API structure

```
server/src/
  db/
    schema/               one file per table + enums.ts, timestamps.ts, barrel index.ts
    database.ts           @Service() class Database — connection + drizzle instance
    migrations/           drizzle-kit output, committed
  adapters/
    sqlite.adapter.ts     defineAdapter: migrate on beforeStart, close on shutdown
    index.ts
  contributors/
    current-user.contributor.ts   verifies Bearer token, loads user, 401 on failure
  modules/
    auth/
      auth.module.ts, auth.controller.ts, auth.service.ts
      users.repository.ts   @Repository() class UsersRepository
      password.ts           scrypt hash + timing-safe verify
      tokens.ts             JWT sign + verify (jose)
      dtos/signup.dto.ts, login.dto.ts
    tasks/
      tasks.module.ts, tasks.controller.ts, tasks.service.ts
      tasks.repository.ts, tasks.constants.ts
      dtos/create-task.dto.ts, update-task.dto.ts
    categories/           same shape
    index.ts
```

`src/guards/`, `src/plugins/`, and `src/middleware/` are removed along with their
`bootstrap()` wiring. `src/adapters/` survives with real adapters;
`src/contributors/` survives with one real contributor.

### Database wiring

`Database` is a `@Service()` singleton owning the `better-sqlite3` connection and
the Drizzle instance. `SqliteAdapter` is a thin `defineAdapter()` that resolves
`Database` and runs `migrate()` in `beforeStart`, then closes the connection in
`shutdown`. The adapter owns lifecycle only; it holds no query logic.

Two alternatives were considered and rejected. A `DatabasePlugin` bundling the
DB, modules, and migrations is the right shape when a feature spans modules plus
middleware plus adapters — overkill for one connection. A module-load side
effect (`export const db = drizzle(...)`) is the fewest lines but puts the
connection outside DI, so tests cannot swap it and shutdown never closes cleanly.

## 5. Schema

```ts
users
  id           text, uuid, PK
  email        text, not null, unique
  passwordHash text, not null
  name         text, not null
  createdAt    integer, timestamp_ms
  updatedAt    integer, timestamp_ms

tasks
  id          text, uuid, PK
  ownerId     text → users.id, not null, on delete RESTRICT, on update cascade
  title       text, not null
  description text, nullable
  priority    text $type<'low' | 'medium' | 'high'>, default 'medium'
  status      text $type<'todo' | 'in_progress' | 'done'>, default 'todo'
  createdAt   integer, timestamp_ms
  updatedAt   integer, timestamp_ms
  INDEX (ownerId)

categories
  id          text, uuid, PK
  ownerId     text → users.id, not null, on delete RESTRICT, on update cascade
  name        text, not null
  color       text, nullable
  createdAt   integer, timestamp_ms
  updatedAt   integer, timestamp_ms
  UNIQUE (ownerId, name)

taskCategories
  taskId      text → tasks.id, on delete cascade, on update cascade
  categoryId  text → categories.id, on delete cascade, on update cascade
  PRIMARY KEY (taskId, categoryId)
```

**Delete behaviour is deliberately split.** The two ownership keys are
`RESTRICT`: a user's tasks and categories have real value, so removing the owner
must fail loudly rather than silently destroying their data. Account deletion
therefore becomes an explicit, ordered operation whenever it is added — not a
side effect. The two join keys stay `CASCADE`: a join row has no independent
value, so deleting a task or a category should clean up its own links.

**Every foreign key is `ON UPDATE CASCADE`.** IDs are UUIDs and are not expected
to change, so this is a safety net rather than a workflow — but if one ever is
rewritten, the references follow instead of breaking.

Text UUIDs over autoincrement integers: safe to expose in URLs and non-guessable.
Timestamps as `integer({ mode: 'timestamp_ms' })` — SQLite has no date type, and
this mode hands back real `Date` objects.

SQLite has no native enum, so `status` and `priority` are text columns typed via
Drizzle's `$type<>` and validated by the Zod request schemas.

`taskCategories` carries no `ownerId`. A join row can only be written between a
task and a category the same user owns — enforced at write time, see §7 — so the
column would be a third copy of an ownership fact the two referenced rows already
carry.

**Foreign keys are off by default in SQLite.** `Database` must issue
`PRAGMA foreign_keys = ON` on connect, or every `ON DELETE` and `ON UPDATE`
clause above is silently decorative — the restricts would not restrict and the
cascades would leave orphans. `PRAGMA journal_mode = WAL` on the same line for concurrent
read throughput.

## 6. Authentication

### Mechanism

Signup and login return a JWT signed with HS256 via `jose`. Clients send it as
`Authorization: Bearer <token>`. There is no refresh token and no server-side
session — logout is a client-side token discard.

Passwords are hashed with `node:crypto` `scrypt` (N=16384, r=8, p=1) against a
32-byte random salt, stored as `scrypt$<salt-hex>$<hash-hex>`. Verification uses
`timingSafeEqual`. This is stdlib and adds no dependency; argon2id and bcrypt
would both be fine but bring a native build step.

### The `CurrentUser` contributor

`defineHttpContextDecorator` with key `'currentUser'`. Its `resolve()`:

1. Reads the `Authorization` header; missing or malformed → `HttpException.unauthorized()`.
2. Verifies the JWT signature and expiry via `jose`; invalid → `unauthorized()`.
3. Loads the user by the token's `sub`; missing (deleted account) → `unauthorized()`.
4. Returns the user row, which the runner writes to `ctx.set('currentUser', …)`.

A contributor whose `resolve()` throws forwards to the request error handler
unless `optional: true` is set — which it is not here. So this one piece both
authenticates and provides, and handlers read `ctx.require('currentUser')`.

This is why a separate guard is unnecessary, and it follows the project's own
deny-list rule: a `@Middleware()` whose only output is `ctx.set()` should be a
context contributor instead.

Registered at the **module** level on `TasksModule` and `CategoriesModule`, and
deliberately not on `AuthModule`, so signup and login stay public. `GET /auth/me`
applies it per-method.

### Ownership is enforced in the repository, not the controller

Every repository method takes `ownerId` as a required parameter and puts it in
the `WHERE` clause:

```ts
findById(id: string, ownerId: string)
update(id: string, dto: UpdateTaskDTO, ownerId: string)
delete(id: string, ownerId: string)
```

A repository method that *can* be called without an owner is a data leak waiting
for the one caller that forgets. Making it a required positional parameter means
the compiler catches the omission instead of a user catching it in production.

Requesting another user's task returns **404, not 403**. A 403 confirms the row
exists, which is an ID-enumeration oracle.

### Environment

`JWT_SECRET` is declared `z.string().min(32)` with **no default**. A signing
secret with a fallback value is a signing secret that ships to production; boot
must fail loudly when it is absent. `.env.example` documents it, `.env` and
`.env.test` carry a local development value, and neither is committed.

## 7. API surface

```
POST   /api/v1/auth/signup            { email, password, name } → { user, token }   public
POST   /api/v1/auth/login             { email, password }       → { user, token }   public
GET    /api/v1/auth/me                                          → user

GET    /api/v1/tasks                  paginated — ctx.qs + ctx.paginate
                                      filterable: status, priority
                                      sortable:   createdAt, updatedAt, priority
                                      searchable: title, description
GET    /api/v1/tasks/grouped          [{ category, tasks[] }] — board view
GET    /api/v1/tasks/:id              404 if missing OR owned by someone else
POST   /api/v1/tasks                  { title, description?, priority?, status?, categoryIds? }
PUT    /api/v1/tasks/:id              partial; categoryIds replaces the set wholesale
DELETE /api/v1/tasks/:id              204

GET    /api/v1/categories             paginated
GET    /api/v1/categories/:id/tasks   paginated tasks in one category
POST   /api/v1/categories             { name, color? }
PUT    /api/v1/categories/:id
DELETE /api/v1/categories/:id         join rows cascade; tasks survive uncategorized
```

Every route except signup and login requires a valid Bearer token, and every one
is scoped to the caller's `ownerId`.

**Route order:** `/tasks/grouped` must be declared before `/tasks/:id`, or the
param route swallows the literal.

**Writes with `categoryIds`** run in a `db.transaction()` — `better-sqlite3` is
synchronous, so transactions are real and cheap. Verify every incoming category
ID belongs to the caller, insert the task, delete the old join rows, insert the
new ones.

**Unknown or unowned `categoryId`** returns **422** with the offending IDs — not
a silent skip. Unowned and nonexistent are reported identically, so the response
cannot be used to probe for other users' category IDs.

**`/tasks/grouped` is not paginated** — a board view wants the whole column.
Total tasks returned are capped at 500 so it cannot become an unbounded table
scan. Uncategorized tasks come last, in their own bucket.

**`passwordHash` never leaves the repository layer.** Auth responses are built
from an explicit field list, never by spreading the user row.

## 8. Config and migrations

```ts
// server/src/config/index.ts
DATABASE_URL:   z.string().default('./data/adero.db'),
JWT_SECRET:     z.string().min(32),          // no default — boot fails without it
JWT_EXPIRES_IN: z.string().default('7d'),
```

Read via `@Value(...)`. `.env.test` sets `DATABASE_URL=:memory:`, so each test
run starts clean with no file cleanup.

```ts
// server/drizzle.config.ts
{ dialect: 'sqlite', schema: './src/db/schema.ts', out: './src/db/migrations' }
```

Scripts: `db:generate` (`drizzle-kit generate`) and `db:studio`. There is no
`db:migrate` script — the adapter's `beforeStart` runs `migrate()` on every boot,
dev and prod. Drizzle tracks applied migrations in `__drizzle_migrations`, so it
is idempotent.

Migration SQL files are committed. `data/*.db` is gitignored.

Dependencies: `drizzle-orm`, `better-sqlite3`, `jose`, `@types/better-sqlite3`
and `drizzle-kit` (dev). Installed via `kick add` so peer resolution and the
pinned package manager stay consistent. Hashing needs nothing — it is `node:crypto`.

> **Known ceiling — migrate on boot.** A bad migration takes the process down at
> startup rather than failing a deliberate CLI step. Acceptable for a single-file
> SQLite dev database. If this ever targets a shared or production DB, move to a
> gated CLI step. Marked in `sqlite.adapter.ts` with a `ponytail:` comment.

## 9. API testing

**Repository tests** — `Container.create()` for isolation, `:memory:` SQLite,
`migrate()` in `beforeEach`. Covers the filter/sort/search SQL and the
many-to-many transaction. This is where the real risk lives.

**Controller tests** — `createTestApp` over the route table: pagination shape,
404 on missing task, 422 on unknown `categoryId`, `/tasks/grouped` payload
shape, cascade behaviour on category delete.

**Auth and isolation tests** — not optional; each is a regression test for a
specific way the design can fail:

- Signup rejects a duplicate email.
- Login with a wrong password fails, and fails identically to login with an
  unknown email (no user-enumeration signal).
- Every protected route returns 401 with no token, a malformed token, an
  expired token, and a token signed with the wrong secret.
- **User A cannot read, update, or delete user B's task** — 404 on all three.
- **User A's list, grouped, and category-tasks routes never contain B's rows.**
- User A cannot attach user B's category to a task — 422.
- No response body from any route contains `passwordHash`.

Errors use `HttpException` and `ctx.problem.*`, already the house pattern.
`@forinda/kickjs-testing` is not currently in `package.json`; Story 1 adds it.

---

# Part II — Workspace and frontend

## 10. Workspace layout

Mirrors `adero-fullstack` exactly — two packages named `server` and `web` at the
repo root, no `apps/` nesting.

```
pnpm-workspace.yaml    packages: [server, web]  + existing allowBuilds / minimumReleaseAgeExclude
package.json           private workspace root — scripts only, no runtime deps
CLAUDE.md              ~20-line workspace pointer — NOT a copy of server/'s
.gitignore             node_modules/ dist/ .env *.local *.log .DS_Store .superpowers/
.gitattributes         text=auto eol=lf + lockfile -diff rules (lockfile lives here)
README.md
server/                everything currently at the repo root, moved wholesale
  .agents/             the ONLY copy — regenerated by `kick g agents -f`
  .kickjs/types/       generated route types — the web package reads these
  src/
web/
  index.html
  vite.config.ts       proxy /api → http://localhost:3000
  tsconfig.json        own config, not extended from a shared base
  src/
```

Root `package.json` carries both `workspaces: ["server", "web"]` and the pnpm
workspace file, matching the sibling project. Scripts:

```json
"dev":        "pnpm --parallel -r run dev",
"dev:server": "pnpm --filter ./server dev",
"dev:web":    "pnpm --filter ./web dev",
"build":      "pnpm -r run build",
"typecheck":  "pnpm -r run typecheck"
```

There is no `tsconfig.base.json`. `adero-fullstack` gives each package its own
tsconfig, and `server` needs `experimentalDecorators` while `web` does not —
a shared base that both packages immediately override is ceremony, not reuse.

### The typed client — this replaces a whole layer

`web` depends on **`@forinda/kickjs-client`**:

```ts
// web/src/api.ts
import { createClient } from '@forinda/kickjs-client'
export const api = createClient<KickApi>({ baseUrl: '/api/v1' })
```

`KickApi` is ambient, populated from the server's generated route types through a
one-line type-only bridge:

```ts
// web/src/types/kick-routes.d.ts
import '../../../server/.kickjs/types/kick__routes'
```

The import is erased at build time, so no server code enters the web bundle.
Regenerated by `kick typegen`, which `kick dev` runs automatically.

This deletes two things the previous draft planned to build: the hand-rolled
typed fetch wrapper, and the `"@adero/api": "workspace:*"` dependency that
existed only to type-import Drizzle rows. Route paths, params, request bodies,
and response shapes all flow from typegen — so a renamed route or a changed Zod
body schema becomes a compile error in `web`, not a runtime 404.

`createClient` accepts `headers` as either a static record **or a factory invoked
per request**, which is where the auth token attaches — no interceptor layer
needed. It also accepts a `fetch` override.

```ts
export const api = createClient<KickApi>({
  baseUrl: '/api/v1',
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
})
```

**Call shape** — method per verb, path template, typed options:

```ts
const task  = await api.get('/tasks/:id', { params: { id } })
const made  = await api.post('/tasks', { body: { title: 'Ship' } })
const page  = await api.get('/tasks', { query: { filter: 'status:eq:todo' } })
```

`params` fills path segments, `body` is the request payload, `query` is the query
string — each typed from the route's Zod schema and `@ApiQueryParams` config.

**Errors** — a non-2xx response throws `KickClientError`, carrying `status`, the
parsed RFC 9457 problem body, and the raw `Response`. A 204 resolves to
`undefined`. This lines up exactly with the API's `ctx.problem.*` error branches
(§7): the shape the server sends is the shape the client surfaces, with no
translation layer.

```ts
try {
  await api.get('/tasks/:id', { params: { id } })
} catch (e) {
  if (e instanceof KickClientError && e.status === 404) showNotFound()
}
```

There is also a `createRpc(api, kickRpc)` wrapper giving `rpc.tasks.get({ … })`,
with namespaces derived from controller names. Not used here — the path-based
form keeps the call site and the route table visually identical, which matters
more than brevity while the API is still being built.

## 11. Frontend stack

| Concern | Choice | Note |
|---|---|---|
| Framework | React 19 + TypeScript | Matches `adero-fullstack` |
| Build | Vite | Dev proxy `/api` → `http://localhost:3000` |
| API client | `@forinda/kickjs-client` | Already in the sibling project; types from `kick typegen` |
| Styling | Tailwind v4 | CSS-first config, no `tailwind.config.js` |
| Routing | React Router | |
| Server state | TanStack Query | Board mutations need coordinated cache invalidation across list, grouped, and detail |
| Forms | React Hook Form + the server's Zod schemas | Same schema validates on both sides |
| Drag and drop | dnd-kit | Deferred to its own story — see §16 |
| Icons | Lucide | |

TanStack Query wraps `kickjs-client` calls rather than replacing them — the
client owns transport and types, Query owns caching and invalidation. Query
functions are one-liners and the data type is inferred, never annotated:

```ts
export const taskQueries = {
  all:    () => queryOptions({ queryKey: ['tasks'] as const,     queryFn: () => api.get('/tasks') }),
  detail: (id: string) =>
          queryOptions({ queryKey: ['tasks', id] as const, queryFn: () => api.get('/tasks/:id', { params: { id } }) }),
}
```

Query keys mirror endpoint paths, so an invalidation reads like the route it
affects. Retry policy keys off the typed error — client errors are not retried:

```ts
retry: (count, error) =>
  error instanceof KickClientError && error.status < 500 ? false : count < 3,
```

If a call ever needs a manual type annotation, that is the signal that
`kick typegen` is stale — regenerate rather than annotate.

No component library. A board, a few forms, and a landing page do not justify
one, and the visual direction below is specific enough that a library's defaults
would be fought more than used.

### Production serving

`SpaAdapter({ clientDir: '../../web/dist', apiPrefix: '/api', exclude: ['/docs', '/_debug'] })`
— resolved from `server/`.
The `apiPrefix` and `exclude` options are what keep the SPA fallback from
swallowing API 404s, the Swagger UI, and the DevTools surface — without them
every mistyped API path returns `index.html` with a 200, which is a genuinely
confusing failure mode to debug.

Root `build` script builds web first, then api.

## 12. Visual system

Direction is ClickUp-sassy: a short opinionated headline, one bold accent, a
product shot on a gradient field. Executed with more restraint than ClickUp
itself — one accent, not three.

**The constraint that drives the palette:** priority and status already need
semantic colors (red/amber for urgency, green for done). If the brand accent is
also red or green, the landing page and the board fight each other. So the
accent lives in the violet family, leaving the entire warm and green range free
for meaning.

```
Brand
  accent        #6D4AFF   violet — buttons, links, focus rings
  accent-hover  #5B3AE0
  gradient      #6D4AFF → #00C2FF   hero blob only, never on text

Neutrals
  ink           #0E0E13   headlines, primary text
  muted         #6B6B7B   secondary text
  hairline      #E6E6EF   borders, dividers
  surface       #FFFFFF   cards
  canvas        #FAFAFC   page background

Semantic — priority
  low     #64748B  slate
  medium  #F59E0B  amber
  high    #EF4444  red

Semantic — status
  todo         #94A3B8  slate
  in_progress  #0EA5E9  sky
  done         #22C55E  green
```

**Status and priority are never encoded in color alone.** Every dot ships with
its label, every priority pill with its word. This is an accessibility floor —
roughly one in twelve men has some form of color vision deficiency — and it also
resolves the only remaining collision in the palette, sky `in_progress` sitting
near violet accent at small sizes.

**Type** — Inter throughout. Landing headlines at `clamp(2.75rem, 6vw, 4.5rem)`,
weight 700, tracking `-0.03em`; the tight tracking at large size is most of what
makes the Height and ClickUp headlines read as designed rather than defaulted.
App UI at 14px base — board density depends on it.

**Motion** — 150ms ease-out on hover and focus, 200ms on card drag. Everything
wrapped in `prefers-reduced-motion`.

## 13. Landing page

One page, one primary CTA ("Get started free" → signup), repeated in nav and
hero. Never two competing CTAs — that was the single most consistent pattern
across all eight landing references.

| Section | Content |
|---|---|
| Nav | Wordmark, Features, Pricing, Log in, Get started free |
| Hero | Social proof line above headline, punchy headline, one-line subhead, email field + button, product screenshot of the board on the violet→cyan gradient blob |
| Logo strip | "Trusted by teams at…" — placeholder marks until there is something true to put here |
| Features | Three columns: board, categories, priorities. Icon, heading, one sentence |
| Board showcase | Full-width screenshot, offset so it bleeds off the right edge (the Coda move) |
| Closing CTA | Repeat of the hero CTA on an accent-tinted band |
| Footer | Minimal — wordmark, three link columns, copyright |

Placing social proof *above* the headline is the cheapest credibility move
available and costs one line — [Harvest](https://mobbin.com/sites/sections/640cffbf-6670-4115-b398-dfd3dd40a816)
and [Contra](https://mobbin.com/sites/sections/1d640180-88dd-48b6-9f71-811994f04b5c)
both do it.

The logo strip ships with honest placeholders. Inventing customer logos for a
product with no customers is the kind of thing that is trivially checkable and
permanently embarrassing.

## 14. App UI

### Board — `/app`

Derived from [Plane](https://mobbin.com/screens/3ab97a90-278b-4784-84d2-00aa05d21aa6)
and [GitHub Projects](https://mobbin.com/screens/e5b3b8e2-3b01-4eb9-9977-40f7f8373d23),
the two references closest to this data model.

- **Three columns** — To do, In progress, Done. Header is a colored status dot,
  the name, and a count. Empty columns stay visible with a persistent "+ Add
  task" affordance; collapsing them hides the fact that a column exists.
- **Filter chips** above the board, dismissible, with "Clear all". Each chip maps
  to one `ctx.qs` filter. This is the honest answer to "why am I seeing three
  tasks" — Plane's pattern, and it makes the allow-list visible instead of
  mysterious.
- **Category filter** drives which tasks appear; `/tasks/grouped` backs the
  grouped view toggle.

### Task card

Title at full weight on its own line, then one dense row of small meta pills
underneath — priority pill, category dots, relative date. That layout is what
[Asana](https://mobbin.com/screens/0a9f2bf5-409a-4af8-9493-531dd6868124) and Plane
converge on independently.

Explicitly **not** [Slack Lists](https://mobbin.com/screens/30463e7e-9650-4753-b401-588d3fe3e5c7),
which prints a "Priority" / "Description" / "Assignee" label on every card face
and spends roughly three times the vertical space for the same information.
[Todoist](https://mobbin.com/screens/866c59ab-6ea2-4bee-bdea-ad3efdff8507) marks
the minimal end of the range if cards start feeling heavy.

### Remaining screens

- **Task detail** — right-side sheet, not a route change. Title, description,
  priority select, status select, category multi-select, delete.
- **Categories** — simple list with inline create, color picker from a fixed
  swatch set, rename, delete with a confirm that states tasks will survive
  uncategorized.
- **Auth** — centered card, email/password, one CTA, inline field errors. Signup
  and login share a layout.
- **Empty states** — every list and column gets one. A first-run board of three
  empty columns with no guidance is the most common way a working app reads as
  broken.

### Token storage

The JWT lives in `localStorage` and is attached by `createClient`'s per-request
`headers` factory — read the token, return `{ Authorization: 'Bearer …' }`, or
return `{}` when signed out. The `fetch` override wraps the default and clears
the token plus redirects to login on any 401. No separate interceptor layer.

> **Known ceiling — `localStorage` token.** It is readable by any successful XSS.
> The mitigations here are that React escapes by default and the codebase uses no
> `dangerouslySetInnerHTML`. The stronger fix is an httpOnly refresh cookie with a
> short-lived in-memory access token, which is a different auth design than the
> one chosen in §6. Revisit together, not piecemeal. Marked with a `ponytail:`
> comment in the auth store.

## 15. Frontend testing

Vitest plus React Testing Library, MSW for API mocking.

- Auth flow: signup, login, token persisted, 401 clears and redirects.
- Board: renders three columns, empty columns present, filter chips add and clear.
- Task create and edit round-trip, including category multi-select.
- Priority and status render their label, not only their color.
- Keyboard: every interactive element reachable by Tab, focus ring visible,
  detail sheet traps focus and closes on Escape.

## 16. Stories

### Phase A — API

| # | Story | Ships |
|---|---|---|
| 1 | **Workspace + strip** | Delete `users/` and the five placeholders; unwire from `bootstrap()`. Then move everything at the root into `server/`, add `packages: [server, web]` to `pnpm-workspace.yaml`, write the private root `package.json` with the five fan-out scripts, add a short workspace-level root `CLAUDE.md` (no root `.agents/` — `server/.agents/` stays the only copy), add `@forinda/kickjs-testing`. `pnpm -r typecheck` and `test` green, `pnpm dev:server` boots. |
| 2 | **Drizzle foundation** | Deps, `drizzle.config.ts`, full `schema.ts`, `Database` service with FK + WAL pragmas, `SqliteAdapter`, `DATABASE_URL`, first migration. Test: boots, migrates, FK cascade fires, closes clean. |
| 3 | **Auth module** | `UsersRepository`, scrypt hashing, `jose` JWT, signup/login/me, `CurrentUser` contributor, `JWT_SECRET`. Plus the two error-surface items below — they become testable the moment a route exists. Tests: duplicate email, wrong password, all four 401 paths, no `passwordHash` in any response. |
| 4 | **Categories module** | Owner-scoped CRUD and paginated list, unique `(ownerId, name)`. First proof of the DI chain and the ownership pattern end to end. Cross-user isolation tests. |
| 5 | **Tasks module** | Owner-scoped CRUD, `ctx.qs`/`ctx.paginate` list, transactional `categoryIds` writes, 422 on unknown or unowned category. Cross-user isolation tests. |
| 6 | **Grouping + API polish** | `/tasks/grouped`, `/categories/:id/tasks`, cascade verification, Swagger tags and Bearer security scheme. |

### Phase B — Frontend foundation

| # | Story | Ships |
|---|---|---|
| 7 | **Web app shell** | `web/` with Vite, React 19, Tailwind v4, React Router, TanStack Query, `@forinda/kickjs-client`. `src/types/kick-routes.d.ts` bridge to `server/.kickjs/types`, `api.ts` with the token `headers` factory and 401 `fetch` override. Vite dev proxy. `SpaAdapter` wired in `server` with `apiPrefix` + `exclude`. `pnpm dev` runs both; root `build` produces one serveable artifact. |
| 8 | **Design system** | Tokens from §12 as Tailwind theme. Button, Input, Select, Pill, Dialog, Sheet, Toast, EmptyState. Focus rings and `prefers-reduced-motion` from the start, not retrofitted. |

### Phase C — Product UI

| # | Story | Ships |
|---|---|---|
| 9 | **Landing page** | All seven sections from §13, responsive, one CTA. Placeholder logo strip. |
| 10 | **Auth screens** | Signup and login, RHF + shared Zod schemas, inline errors, token persistence, protected route wrapper, 401 redirect. |
| 11 | **Board and task management** | Three-column board, filter chips, task cards, detail sheet, create/edit/delete, category management screen, empty states throughout. |
| 12 | **Drag-and-drop + polish** | dnd-kit column-to-column drag with optimistic status update and rollback on failure, keyboard drag alternative, loading skeletons, a11y pass. |

Dependencies: 2 blocks 3; 3 blocks 4 (owner scoping needs a real user); 4 blocks
5 (join table needs categories); 5 blocks 6. Phase B needs 3 (the client needs
auth to talk to). Phase C needs 8. Story 12 needs 11.

Story 9 is the only one with no upstream dependency beyond 8 — the landing page
touches no API, so it can be built in parallel with Phase A if there is a second
pair of hands.

**Story 12 is separate on purpose.** A kanban board with no drag still works;
status changes through the card menu. Shipping 11 first means the board is
usable while drag-and-drop — the piece most likely to eat time on touch targets,
scroll containers, and keyboard fallbacks — gets its own budget.

### Story 2 readiness notes

Carried forward from the Story 1 final review so they are not lost before
Story 2 (Drizzle foundation) starts:

- `pnpm-workspace.yaml` must gain `'better-sqlite3': true` under `allowBuilds`
  **in the same commit that adds the dependency**. It is a native module; pnpm
  10 silently skips unlisted build scripts, so install appears to succeed and
  the adapter then fails at boot with a `Could not locate the bindings file`
  error that reads like a code bug, not a missing allow-list entry.
- Create `server/src/adapters/index.ts` when `SqliteAdapter` lands. A third
  adapter inlined into `server/src/index.ts` is exactly the shape the
  thin-entry-file rule forbids. The two `isProduction` spreads move there and
  stay separate.
- Add `*.db`, `*.db-wal`, `*.db-shm` to `server/.gitignore` in the same commit
  — WAL mode creates all three on first boot.
- Nothing currently imports `server/src/index.ts` in a test; the smoke test
  builds its own app via `createTestApp({ modules: [] })`. The adapter list,
  the production gate, and the `import './config'` ordering have zero
  coverage. Add a test that imports `{ app }` from `../index` when adding
  `SqliteAdapter`.

## 16b. Carried from Story 1 — two error-surface items for Story 3

Both were found during Story 1 and deferred because they are untestable while the
app has zero routes. Story 3 adds the first ones, so they belong there — not in
the Story 6 polish pass.

**`onNotFound` does not emit RFC 9457.** Measured against a production build, an
unmatched route returns:

```
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"message":"Not Found"}
```

§7 specifies every error branch goes through `ctx.problem.*`, which emits
`application/problem+json`. So once real routes exist, a mistyped path and a
handler-raised 404 return different shapes at the same status — and the typed
client parses `KickClientError.body` as problem details, so one of the two hands
it something it cannot read. It fails as a wrong-shaped body, not a throw, which
is the quiet kind. Fix by passing `onNotFound` to `bootstrap()`:

```ts
onNotFound?: (req: any, res: any, next: any) => void
```

**Whether the built-in `onError` leaks stack traces in production is UNVERIFIED.**
It could not be determined from the framework bundle and cannot be triggered with
no routes mounted. The override, if needed, is the standard four-arg Express
signature:

```ts
onError?: (err: any, req: any, res: any, next: any) => void
```

Make this an explicit acceptance item on Story 3 — the commit that adds a route
able to throw is the same commit that makes a leak exploitable.

Both hooks take **raw Express args**, not `RequestContext`. That is engine
coupling: fine while `kick.config.ts` pins `runtime: 'express'`, but it is the
piece that breaks if the runtime ever moves to Fastify or h3.

## 17. Constraints carried from `.agents/`

- `defineAdapter()` / `definePlugin()` / `defineModule()` factories — never
  `class implements`.
- `@Controller()` takes no path argument; the mount prefix comes from
  `routes().path`.
- Module entry files must be named `<name>.module.ts` or Vite HMR degrades to a
  full restart on every save.
- `src/index.ts` must end with `export const app = await bootstrap({ ... })`.
- Keep `src/index.ts` thin — aggregate in `src/modules/index.ts` and
  `src/adapters/index.ts`, pass by name.
- Global middleware uses `(req, res, next)`; `@Middleware()` decorators use
  `(ctx, next)`.
- Any new env key must be in the Zod schema in `src/config/index.ts`, or
  `@Value()` silently falls back to raw `process.env` with no coercion.
- List endpoints must set the `filterable`/`sortable` allow-list, or every
  client filter is silently dropped.
- Contributors must **return** their value — assigning `ctx.currentUser = x`
  sticks to one `RequestContext` instance and silently vanishes.
- Read env values with `getEnv('KEY')` from `@forinda/kickjs`, not a named import
  from `./config` and not raw `process.env`. `getEnv` is typed off the generated
  `KickEnv` interface and keeps `import './config'` a pure side-effect import.
- `DevToolsAdapter` mounts only when `getEnv('NODE_ENV') !== 'production'`. Its
  `secret: false` setting is an explicit opt-out of authentication on a surface
  that exposes the route table, DI graph, and adapter list. `SwaggerAdapter` is
  gated the same way, in its own separate `...(isProduction ? [] : [...])`
  spread — `/docs`, `/redoc`, and `/openapi.json` are just as much of an
  unauthenticated information surface.
- After the move, re-run `kick g agents -f` from `server/` so its `.agents/`
  reflects the new layout. There is deliberately **no** root `.agents/` — that
  command regenerates only `server/`'s, so a root duplicate would be stale by
  construction. The root `CLAUDE.md` is a short hand-maintained pointer to
  `server/.agents/AGENTS.md`, not a second copy of the conventions.
- `kick typegen` must have run in `server/` before `web` typechecks — the
  `KickApi` ambient type comes from `server/.kickjs/types/kick__routes`. A clean
  clone that runs `pnpm typecheck` before `pnpm dev:server` will fail on a
  missing module until typegen has produced it once. Root `build` therefore runs
  `server` before `web`.
