# adero

A task-management REST API. Users sign up, get a JWT, and keep private tasks
and categories. A task can carry many categories and a category can hold many
tasks; `GET /tasks/grouped` returns the whole board in one call.

Every row is owner-scoped off the verified token — never off a body or query
parameter. Another user's id is a `404` with a body byte-identical to a
genuinely missing one, so the API is not a probe for what exists.

## Layout

- `server/` — the API (KickJS v6 on Express, SQLite via Drizzle, Zod, Vitest)
- `web/` — React + Vite client (Story 7, not here yet)

`kick` lives in `server/node_modules/.bin`, so every `kick` command runs from
inside `server/`, never from the repo root.

## Getting started

```bash
pnpm install
cp server/.env.example server/.env
# then set JWT_SECRET — see below, the copy will NOT boot as-is
openssl rand -base64 48
pnpm dev:server        # http://localhost:3000
```

Migrations run on every boot; there is no separate migrate step. The SQLite
file and its parent directory are created if missing.

| Command | What it does |
| --- | --- |
| `pnpm dev:server` | dev server with reload |
| `pnpm test` | Vitest, every package |
| `pnpm typecheck` | `kick typegen` + `tsc --noEmit` |
| `pnpm build` | production bundle |
| `pnpm --filter ./server start` | run the built bundle |
| `pnpm --filter ./server db:generate` | regenerate migrations after a schema edit |
| `pnpm --filter ./server db:studio` | Drizzle Studio |

In development only, the spec and docs are served at `/openapi.json`, `/docs`,
`/redoc`, and DevTools at `/_debug` — all unauthenticated, which is why
`NODE_ENV=production` is not optional in a deployment.

## Environment

`server/.env`, validated by a Zod schema at boot. A missing or malformed value
fails the boot; nothing falls back silently.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port. |
| `NODE_ENV` | **none** | `development` \| `production` \| `test`. No default on purpose: an unset value must not resolve to `development` and mount the unauthenticated DevTools and Swagger surfaces in production. |
| `LOG_LEVEL` | `info` | Logger threshold. `silent` under test. |
| `DATABASE_URL` | `./data/adero.db` | SQLite file path, or `:memory:`. WAL is enabled for file databases, skipped for in-memory. |
| `JWT_SECRET` | **none** | HMAC signing key, minimum 32 characters. See below. |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime, any `jose` duration string. |

### JWT_SECRET is deliberately empty in .env.example

`.env.example` ships `JWT_SECRET=` with no value. This is intentional, not an
oversight. A placeholder long enough to satisfy `min(32)` would mean
`cp .env.example .env` boots a server that signs every token with a secret
published in this repository — and it would boot silently, which is the worst
possible outcome. An empty value fails the schema loudly on the first run.

Generate one with `openssl rand -base64 48`.

## Routes

Base path `/api/v1`. Everything except signup and login requires
`Authorization: Bearer <token>`; the OpenAPI document declares `BearerAuth` on
exactly those routes and marks the two public ones explicitly.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/signup` | public | `201` with `{ user, token }`. Rate limited: 10/min per IP. |
| `POST` | `/auth/login` | public | `{ user, token }`. Same rate limit. |
| `GET` | `/auth/me` | bearer | The current user. Never includes `passwordHash`. |
| `GET` | `/categories` | bearer | Paginated. |
| `POST` | `/categories` | bearer | `201`. Name is unique per owner. |
| `PUT` | `/categories/:id` | bearer | |
| `DELETE` | `/categories/:id` | bearer | `204`. Tasks survive; only the links go. |
| `GET` | `/categories/:id/tasks` | bearer | Tasks in one category, paginated. `404` for an id that is not yours. |
| `GET` | `/tasks` | bearer | Paginated, filterable, sortable, searchable. |
| `POST` | `/tasks` | bearer | `201`. Optional `categoryIds`, all of which must be yours. |
| `GET` | `/tasks/grouped` | bearer | One column per category plus a trailing `{ category: null }` bucket. A task with two categories appears in both columns. |
| `GET` | `/tasks/:id` | bearer | |
| `PUT` | `/tasks/:id` | bearer | `categoryIds` replaces the whole set; omit it to leave links alone. |
| `DELETE` | `/tasks/:id` | bearer | `204`. Categories survive. |

### Query parameters

On `/tasks` and `/categories/:id/tasks`:

- `?page=1&limit=20` — response is `{ data, meta: { total, totalPages, … } }`
- `?filter=status:eq:todo` — repeatable and ANDed. Fields: `status`,
  `priority`. Operators include `eq` and `neq`. An unknown field or an unknown
  enum value is a `422`.
- `?sort=priority:asc` — `createdAt`, `updatedAt`, `priority`, `status`, `title`
- `?q=needle` — searches `title` and `description`

`/categories` sorts on `name`, `createdAt`, `updatedAt` and searches `name`.

### Errors

RFC 9457 `application/problem+json` throughout, including unmatched routes.
Validation failures are **422**, not 400. Internal errors are redacted.

## Data model

`users` → `tasks` and `categories`, joined by `task_categories`.

Foreign keys are enforced (`PRAGMA foreign_keys = ON` at connection time —
without it every `ON DELETE` clause below is inert):

- `task_categories.task_id` and `.category_id` — **cascade**. A join row has no
  value of its own, so deleting either side removes the link and leaves the
  other side standing.
- `tasks.owner_id` and `categories.owner_id` — **restrict**. A user's tasks and
  categories have independent value, so deleting the user fails loudly rather
  than silently destroying them. There is no user-delete endpoint; if one is
  added it must clear that user's tasks and categories first.

See `server/src/modules/tasks/__tests__/cascade.test.ts` for the proof of all
three at the HTTP level.

## Further reading

- `plan.md` — full project design
- `server/CLAUDE.md`, `server/.agents/AGENTS.md` — KickJS conventions
