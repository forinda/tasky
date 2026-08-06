# adero

Task management API and web client.

## Layout

- `server/` — KickJS API (Express, SQLite via Drizzle)
- `web/` — React + Vite client (added in Story 7)

## Getting started

```bash
pnpm install
cp server/.env.example server/.env   # sets NODE_ENV; required by the built artifact (pnpm dev:server works without it)
pnpm dev:server
```

See `plan.md` for the full design.
