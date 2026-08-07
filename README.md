# tasky

A Jira-lite task app. Sign up, get a JWT, keep private tasks and categories on a
three-column board. KickJS v6 + SQLite on the server, React 19 + Vite on the
client, one pnpm workspace.

- `server/` — the API (KickJS v6 on Express, Drizzle, Zod, Vitest)
- `web/` — the client (React 19, Vite, Tailwind v4, React Router, TanStack Query)

## Getting started

```bash
pnpm install
cp server/.env.example server/.env
openssl rand -base64 48        # paste into JWT_SECRET — it will NOT boot empty
pnpm dev                       # API on :3000, client on :5173
```

`pnpm dev` runs both. Migrations run on every boot; there is no migrate step,
and the SQLite file is created if missing.

| Command | What it does |
| --- | --- |
| `pnpm dev` | both packages |
| `pnpm test` | Vitest, every package |
| `pnpm typecheck` | `kick typegen` + `tsc --noEmit` |
| `pnpm build` | server first, then client — that order is required |
| `pnpm --filter ./server db:generate` | regenerate migrations after a schema edit |
| `pnpm --filter ./server db:studio` | Drizzle Studio |

## Things that will bite you

**`JWT_SECRET` is empty in `.env.example` on purpose.** A placeholder long enough
to pass `min(32)` would mean `cp .env.example .env` boots a server signing every
token with a secret published in this repo — silently. Empty fails loudly on the
first run instead.

**Auth is a short access token plus an httpOnly refresh cookie.** The 15-minute
JWT lives only in memory in the browser; the refresh cookie is `HttpOnly`,
`SameSite=Strict`, and rotates on every use. Replaying a spent refresh token
revokes the whole session family — including for the honest user, which is the
point: it is the only signal available that a token was stolen.

**Your proxy must preserve `Host`.** `/auth/refresh` and `/auth/logout` reject a
request whose `Origin` does not match `Host`. A proxy that rewrites `Host`
therefore rejects every refresh — nginx wants `proxy_set_header Host $host`, and
the Vite dev proxy is configured with `changeOrigin: false` for the same reason.

**`NODE_ENV` has no default.** An unset value must not resolve to `development`,
because `/docs`, `/redoc`, `/openapi.json`, and `/_debug` are unauthenticated and
dev-only. `NODE_ENV=production` is not optional in a deployment.

**Run `kick` from inside `server/`.** It lives in `server/node_modules/.bin`, not
at the root.

**No CORS anywhere.** Vite proxies `/api/v1` in development and `SpaAdapter`
serves the built client in production, so both are same-origin. If your API is on
another port, set `VITE_API_TARGET` in `web/.env` rather than editing
`vite.config.ts`.

**API types are generated, never hand-written.** `web/src/lib/api.ts` is
`createClient<KickApi>` where `KickApi` comes from `kick typegen`. Rename a route
and the client fails to compile rather than 404-ing at runtime.

**Errors are RFC 9457 `application/problem+json`,** and validation failures are
`422`, not `400`.

## Where things are

```
web/src/
  lib/         api client, token store, query client, cn()
  features/    <name>/{keys,queries,mutations}.ts
  components/  ui/ — shadcn
  routes/
```

`/gallery` is a dev-only page showing every component and state. It is dropped
from production builds.

## Further reading

- **Routes** — run `pnpm dev` and open `/docs`. Generated from the controllers,
  so unlike a table in this file it cannot drift.
- `plan.md` — full design: schema, auth, ownership rules, visual system
- `server/CLAUDE.md`, `server/.agents/AGENTS.md` — KickJS conventions
