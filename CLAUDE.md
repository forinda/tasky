# CLAUDE.md — adero (workspace root)

This is a pnpm workspace. All application code lives in `server/` (a
KickJS v6 API on Express); a `web/` package arrives in a later story.
There is no `src/` at the repo root, and `kick` is not installed here
— it lives in `server/node_modules/.bin`, so any `kick` command must
be run from inside `server/`, not from the root.

**Canonical agent reference:** `server/.agents/AGENTS.md`, with
task-oriented skills under `server/.agents/skills/`. Read those before
touching anything under `server/`. There is no root-level `.agents/`
copy — nothing regenerates it, so it would only go stale.

## Browser automation output

Screenshots, DOM snapshots, and console logs from browser-automation tools go in
**`.mcp-assets/`**, which is gitignored. Never write them to the repo root, and
never commit them.

They are evidence for one review, not repository content: a screenshot goes
stale the next time the UI changes and nothing ever updates it, so a committed
one is a picture of a version the code no longer describes. Two did reach `main`
this way (`auth-login.png`, `login.png`) before the rule existed.

```
.mcp-assets/board-dark.png        # good
./board-dark.png                  # never — this lands in a commit
```

`.playwright-mcp/` is also ignored — some tools write their own scratch
directory there and it is not always configurable.

## Root scripts

```bash
pnpm install       # install dependencies for every workspace package
pnpm dev           # pnpm --parallel -r run dev
pnpm dev:server    # pnpm --filter ./server dev
pnpm build         # pnpm -r run build
pnpm test          # pnpm -r run test
pnpm typecheck     # pnpm -r run typecheck
```

See `plan.md` for the full project design and `server/CLAUDE.md` /
`server/.agents/AGENTS.md` for KickJS-specific conventions.
