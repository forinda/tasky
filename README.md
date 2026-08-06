# adero

Task management API and web client.

## Layout

- `server/` — KickJS API (Express, SQLite via Drizzle)
- `web/` — React + Vite client (added in Story 7)

## Getting started

```bash
pnpm install
cp server/.env.example server/.env   # keep every key — the env schema is re-validated on each reload
pnpm dev:server
```

See `plan.md` for the full design.
