# Story 1 — Workspace + Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the inert KickJS scaffolding, then restructure the repo into a pnpm workspace with the API living in `server/`, matching the layout of the sibling `adero-fullstack` project.

**Architecture:** Three sequential tasks. Initialize git so the restructure is reviewable as renames. Delete the placeholder module and five stub files, using a bootstrap smoke test as the safety net and `tsc` as the failure detector. Then move every root file into `server/` and add the workspace root.

**Tech Stack:** KickJS v6 (Express runtime), TypeScript, Vitest, supertest, pnpm workspaces.

## Global Constraints

- Node package manager is **pnpm**, pinned in `kick.config.ts`. Never invoke `npm` or `yarn`.
- `src/index.ts` must end with `export const app = await bootstrap({ ... })` — the Vite plugin and `createTestApp` import the named `app`. Without it HMR silently degrades to full restarts.
- `src/index.ts` must keep `import './config'` as the first import after `reflect-metadata` — it is a side-effect import that registers the env schema before any `@Value` resolves.
- Module entry files must be named `<name>.module.ts`.
- `defineModules()` / `defineModule()` / `defineAdapter()` / `definePlugin()` factories only — never `class implements`.
- The final `server/` layout mirrors `/home/forinda/Desktop/adero-fullstack/server/` exactly.
- `.kickjs/` is gitignored. Generated types are rebuilt by `kick typegen`, never committed.
- Package names: root `adero-api`, server `adero-api-server`.

## Already Done (do not redo)

`@forinda/kickjs-testing@^7.0.2`, `supertest@^7.2.2`, and `@types/supertest@^7.2.1` are already in `devDependencies` and installed. Verify with `grep supertest package.json` before adding anything.

---

## File Structure

**Task 2 — deletions and edits (paths relative to repo root, pre-move):**

| Path | Action |
|---|---|
| `src/modules/users/` | Delete (entire directory, 10 files) |
| `src/adapters/my-adapter.adapter.ts` | Delete |
| `src/plugins/my-plugin.plugin.ts` | Delete |
| `src/guards/my-guard.guard.ts` | Delete |
| `src/middleware/md-ware.middleware.ts` | Delete |
| `src/contributors/authorize.contributor.ts` | Delete |
| `src/adapters/`, `src/plugins/`, `src/guards/`, `src/middleware/`, `src/contributors/` | Delete the now-empty directories |
| `src/modules/index.ts` | Modify — drop the `UsersModule` mount |
| `src/index.ts` | Modify — drop the `mdWare` import and `middlewares` option |
| `src/__tests__/smoke.test.ts` | Create — bootstrap safety net |

**Task 3 — moves:**

Everything at the repo root except `node_modules/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `docs/`, and `plan.md` moves into `server/`. The root then gains a new `package.json`, `.gitignore`, `README.md`, plus copies of `CLAUDE.md` and `.agents/`.

---

### Task 1: Initialize the git repository

This directory is **not** a git repository — `git status` currently fails with `fatal: not a git repository`. Every later task commits, and Task 3 is a large rename that is only reviewable with git history. So this comes first.

**Files:**
- Create: `.git/` (via `git init`)
- Verify: `.gitignore` (already exists at the root, no changes needed)

**Interfaces:**
- Consumes: nothing
- Produces: a git repository with one baseline commit containing the untouched scaffold. Later tasks diff against this.

- [ ] **Step 1: Confirm you are in the right directory and it is not already a repo**

```bash
cd /home/forinda/Desktop/adero-api
pwd
git status
```

Expected: `pwd` prints `/home/forinda/Desktop/adero-api`, and `git status` prints `fatal: not a git repository (or any of the parent directories): .git`.

If `git status` succeeds, a repo already exists — skip to Step 4 and commit only what is uncommitted.

- [ ] **Step 2: Initialize the repository**

```bash
git init
```

- [ ] **Step 3: Verify `.gitignore` already excludes the right things**

```bash
cat .gitignore
```

Expected output includes `node_modules/`, `dist/`, `.env`, `*.local`, `coverage/`, `.DS_Store`, `*.tsbuildinfo`, and `.kickjs/`. Do not edit it. Note that `.env.test` is deliberately **not** ignored — it is the suite's shared reviewable environment.

- [ ] **Step 4: Stage everything and confirm no secrets or build output crept in**

```bash
git add -A
git status --short | head -40
```

Expected: `src/`, `.agents/`, config files, `CLAUDE.md`, `plan.md`, `docs/`. Expected **absent**: anything under `node_modules/`, `.kickjs/`, `dist/`, and the file `.env`.

If `.env` or `.kickjs/` appear, stop — `.gitignore` is not being honoured. Run `git rm -r --cached .env .kickjs` and investigate before continuing.

- [ ] **Step 5: Commit the baseline**

```bash
git commit -m "chore: initialize repository at KickJS scaffold baseline"
```

- [ ] **Step 6: Verify the commit landed**

```bash
git log --oneline
```

Expected: exactly one commit.

---

### Task 2: Strip the scaffolding

Delete the placeholder `users` module and the five inert stub files. A bootstrap smoke test is written **first** as the safety net — it must pass before and after the deletion. The genuine failure signal comes from `tsc`, because `.kickjs/types/` contains four generated files that import from the deleted module.

**Files:**
- Create: `src/__tests__/smoke.test.ts`
- Delete: `src/modules/users/` (whole directory)
- Delete: `src/adapters/my-adapter.adapter.ts`, `src/plugins/my-plugin.plugin.ts`, `src/guards/my-guard.guard.ts`, `src/middleware/md-ware.middleware.ts`, `src/contributors/authorize.contributor.ts`
- Modify: `src/modules/index.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `createTestApp(options: CreateTestAppOptions): Promise<{ app: Application; expressApp: express.Express; container: Container }>` from `@forinda/kickjs-testing`. `CreateTestAppOptions` requires `modules: AppModuleEntry[]` and accepts optional `adapters`, `overrides`, and `isolated`.
- Produces: `export const modules` from `src/modules/index.ts` — an empty `defineModules()` chain that Task 4 of Story 2 mounts onto. `export const app` from `src/index.ts`, unchanged in name and type.

- [ ] **Step 1: Write the smoke test**

Create `src/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createTestApp } from '@forinda/kickjs-testing'

describe('application bootstrap', () => {
  it('boots with no modules registered', async () => {
    const { expressApp, container } = await createTestApp({
      modules: [],
      isolated: true,
    })

    expect(expressApp).toBeDefined()
    expect(container).toBeDefined()
  })

  it('returns 404 for an unknown route', async () => {
    const { expressApp } = await createTestApp({
      modules: [],
      isolated: true,
    })

    const res = await request(expressApp).get('/api/v1/nope')

    expect(res.status).toBe(404)
  })
})
```

`isolated: true` uses `Container.create()` rather than the global singleton, so the two cases cannot leak DI state into each other.

- [ ] **Step 2: Run the smoke test — it should pass immediately**

```bash
pnpm exec vitest run src/__tests__/smoke.test.ts --reporter=verbose
```

Expected: PASS, 2 tests. This is the safety net, not a red test — it proves the harness works *before* you delete anything, so a later failure is unambiguously caused by the deletion.

If it fails, stop. Do not delete anything until this passes.

- [ ] **Step 3: Commit the safety net**

```bash
git add src/__tests__/smoke.test.ts
git commit -m "test: add bootstrap smoke test"
```

- [ ] **Step 4: Delete the users module and the five stubs**

```bash
git rm -r src/modules/users
git rm src/adapters/my-adapter.adapter.ts \
       src/plugins/my-plugin.plugin.ts \
       src/guards/my-guard.guard.ts \
       src/middleware/md-ware.middleware.ts \
       src/contributors/authorize.contributor.ts
```

- [ ] **Step 5: Remove the five now-empty directories**

`git rm` leaves empty directories behind on disk; git itself does not track them, but a stray empty folder confuses the Vite globs.

```bash
rmdir src/adapters src/plugins src/guards src/middleware src/contributors
ls src
```

Expected `ls src`: `__tests__`, `config`, `index.ts`, `modules`.

If `rmdir` reports "Directory not empty", something else lives there — list it with `ls -a <dir>` and resolve before continuing.

- [ ] **Step 6: Run typecheck to see it fail**

```bash
pnpm run typecheck
```

Expected: FAIL. Errors point at `src/index.ts` for the missing `./middleware/md-ware.middleware` module, and at `.kickjs/types/kick__routes.ts` for imports of `../../src/modules/users/...`.

This is the red state. Two separate causes, fixed in the next two steps.

- [ ] **Step 7: Rewrite `src/index.ts` without the deleted middleware**

Replace the whole file with:

```ts
import 'reflect-metadata'
// Side-effect import — registers the extended env schema with kickjs
// **before** any controller / service / @Value gets resolved. Without
// this line ConfigService.get('YOUR_KEY') returns undefined because the
// cached schema would still be the base shape.
import './config'
import { bootstrap, expressRuntime, getEnv } from '@forinda/kickjs'
import { SwaggerAdapter } from '@forinda/kickjs-swagger'
import { DevToolsAdapter } from '@forinda/kickjs-devtools'
import { modules } from './modules'

const isProduction = getEnv('NODE_ENV') === 'production'

// Export the app for the Vite plugin (dev mode) and createTestApp.
export const app = await bootstrap({
  modules,
  runtime: expressRuntime(),
  adapters: [
    // DevTools exposes the route table, DI graph, and adapter list with no
    // auth (`secret: false`). Never mount it in production.
    ...(isProduction ? [] : [DevToolsAdapter({ secret: false })]),
    SwaggerAdapter({
      info: {
        title: 'Adero API',
        description: 'Adero API',
        version: '1.0.0',
      },
    }),
  ],
})
```

The `middlewares: [mdWare()]` option is gone entirely.

**On the DevTools gate:** the scaffold mounted `DevToolsAdapter({ secret: false })`
unconditionally. The adapter's option type is `secret?: string | false`, and the
package's documented usage is `DevToolsAdapter({ secret: getEnv('DEVTOOLS_SECRET') })`
— so `false` is an explicit opt-out of authentication on a surface that exposes
internal structure. Gating on `NODE_ENV` is the agreed fix.

Read the value with `getEnv('NODE_ENV')`, not a named import from `./config` and
not raw `process.env`. `getEnv` reads the env cache that `./config` registers, and
its return type comes from the generated `KickEnv` interface — which
`.kickjs/types/kick__env.ts` derives from the Zod schema in `src/config/index.ts`
— so the value is typed `'development' | 'production' | 'test'` and schema-coerced.
This also keeps `import './config'` a pure side-effect import, which is what the
first-import constraint is actually about.

Swagger is deliberately left mounted in all environments for now; whether it
should be gated too is a Story 6 decision.

- [ ] **Step 8: Rewrite `src/modules/index.ts` as an empty chain**

Replace the whole file with:

```ts
import { defineModules } from '@forinda/kickjs'

// Modules are appended here by `kick g module <name>` as
// `.mount(NewModule())` on the chain below.
export const modules = defineModules()
```

- [ ] **Step 9: Regenerate the typegen output**

The four files under `.kickjs/types/` still import from the deleted module. They are generated, never hand-edited.

```bash
pnpm run typegen
```

- [ ] **Step 10: Confirm the stale references are gone**

```bash
grep -rn "Users" .kickjs/types/ || echo "clean — no stale references"
```

Expected: `clean — no stale references`.

If references remain, the typegen ran against a cache. Delete `.kickjs/cache/scan.json` and rerun Step 9.

- [ ] **Step 11: Run typecheck to see it pass**

```bash
pnpm run typecheck
```

Expected: PASS, no output.

- [ ] **Step 12: Run the full test suite**

```bash
pnpm run test
```

Expected: PASS, 1 test file, 2 tests. The two `users` placeholder test files are gone with the module, so the smoke test is now the entire suite.

- [ ] **Step 13: Boot the dev server and confirm it comes up clean**

```bash
timeout 20 pnpm run dev
```

Expected: the server starts and logs a listening line on port 3000 with no module routes, then `timeout` kills it after 20 seconds. Expected **absent**: any error mentioning `mdWare`, `my-adapter`, or `users`.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "refactor: remove placeholder users module and scaffold stubs"
```

---

### Task 3: Restructure into a pnpm workspace

Move the entire API into `server/` and add the workspace root. The target is the layout of `/home/forinda/Desktop/adero-fullstack`, which you can read directly for reference.

`web/` is **not** created here — that is Story 7. Consequently `pnpm-workspace.yaml` lists only `server` for now, and the root has no `dev:web` script yet. Listing a package directory that does not exist is a needless risk for zero benefit.

**Files:**
- Create: `server/` and move all API files into it
- Create: `package.json` (new workspace root)
- Create: `.gitignore` (new, simple root version)
- Create: `README.md` (new workspace root readme)
- Create: `CLAUDE.md` and `.agents/` at the root (copies; `server/` keeps its own)
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: `export const modules` and `export const app` from Task 2, both unchanged — only their path changes, from `src/…` to `server/src/…`.
- Produces: root scripts `dev`, `dev:server`, `build`, `test`, `typecheck`. Story 7 adds `dev:web` and appends `web` to the workspace packages list.

- [ ] **Step 1: Read the reference layout**

```bash
ls -a /home/forinda/Desktop/adero-fullstack
ls -a /home/forinda/Desktop/adero-fullstack/server
cat /home/forinda/Desktop/adero-fullstack/package.json
cat /home/forinda/Desktop/adero-fullstack/pnpm-workspace.yaml
```

Note that the root and `server/` each carry their own `CLAUDE.md`, `.agents/`, `README.md`, and `.gitignore`. That duplication is intentional.

- [ ] **Step 2: Create `server/` and move the API into it**

`node_modules/`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` stay at the root. `docs/` and `plan.md` stay at the root — they describe the whole project, not the server.

```bash
mkdir -p server
mv .editorconfig .env .env.example .env.test .gitattributes .gitignore \
   .prettierrc CLAUDE.md README.md kick.config.ts package.json \
   tsconfig.json vite.config.ts vitest.config.ts src .agents .kickjs \
   server/
```

Plain `mv` rather than `git mv` — several of these paths are gitignored (`.env`, `.kickjs/`) and `git mv` refuses those. Git detects the renames at commit time from content.

- [ ] **Step 3: Verify the root is now nearly empty**

```bash
ls -a
```

Expected: `.`, `..`, `.git`, `docs`, `node_modules`, `plan.md`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `server`.

- [ ] **Step 4: Rename the server package**

Edit `server/package.json` and change the `name` field only:

```json
"name": "adero-api-server",
```

Leave `version`, `type`, every script, and every dependency exactly as they are.

- [ ] **Step 5: Write the workspace root `package.json`**

Create `package.json` at the repo root:

```json
{
  "name": "adero-api",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "pnpm --parallel -r run dev",
    "dev:server": "pnpm --filter ./server dev",
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "typecheck": "pnpm -r run typecheck"
  },
  "workspaces": [
    "server"
  ]
}
```

`private: true` prevents publishing the root by accident. Both `workspaces` and `pnpm-workspace.yaml` are present, matching `adero-fullstack`.

- [ ] **Step 6: Add the packages list to `pnpm-workspace.yaml`**

Edit `pnpm-workspace.yaml` so `packages` is the first key, keeping the two existing keys untouched below it:

```yaml
packages:
  - server
allowBuilds:
  '@scarf/scarf': true
  '@swc/core': true
minimumReleaseAgeExclude:
  - '@forinda/kickjs-cli@6.11.2'
  - '@forinda/kickjs@6.7.0'
```

- [ ] **Step 7: Write the root `.gitignore`**

Create `.gitignore` at the repo root. `server/.gitignore` already carries the detailed KickJS rules and stays as-is.

```
node_modules/
dist/
.env
*.log
.DS_Store
```

- [ ] **Step 8: Write the root `README.md`**

Create `README.md` at the repo root:

````markdown
# adero

Task management API and web client.

## Layout

- `server/` — KickJS API (Express, SQLite via Drizzle)
- `web/` — React + Vite client (added in Story 7)

## Getting started

```bash
pnpm install
pnpm dev:server
```

See `plan.md` for the full design.
````

- [ ] **Step 9: Copy the agent docs to the root**

`server/` keeps its own copies — `kick g agents -f` regenerates those. The root copies describe the workspace and are maintained by hand.

```bash
cp server/CLAUDE.md CLAUDE.md
cp -r server/.agents .agents
```

- [ ] **Step 10: Reinstall dependencies under the new workspace layout**

```bash
rm -rf node_modules server/node_modules
pnpm install
```

Expected: pnpm reports installing for the `server` project. `node_modules/` appears at both the root and inside `server/`.

- [ ] **Step 11: Run typecheck across the workspace**

```bash
pnpm run typecheck
```

Expected: PASS. If it fails on missing `.kickjs/types`, run `pnpm --filter ./server typegen` and retry — the generated types are gitignored and may not have survived the move.

- [ ] **Step 12: Run tests across the workspace**

```bash
pnpm run test
```

Expected: PASS, 1 test file, 2 tests, reported under the `adero-api-server` project.

- [ ] **Step 13: Boot the server through the root script**

```bash
timeout 20 pnpm run dev:server
```

Expected: the server starts and logs a listening line on port 3000, then `timeout` kills it.

- [ ] **Step 14: Confirm the parallel script works too**

```bash
timeout 20 pnpm run dev
```

Expected: same result — with only one package in the workspace, `--parallel -r` runs just the server.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "refactor: restructure into pnpm workspace with server package"
```

- [ ] **Step 16: Confirm git recorded the move as renames, not delete-plus-add**

```bash
git show --stat HEAD | head -20
```

Expected: lines of the form `src/index.ts => server/src/index.ts`. If git recorded wholesale deletions and additions instead, the history is still correct — content is identical — but review is harder. No action needed either way.

---

## Done when

- [ ] `git log --oneline` shows four commits.
- [ ] `ls -a` at the root shows only `.git`, `.gitignore`, `.agents`, `CLAUDE.md`, `README.md`, `docs`, `node_modules`, `package.json`, `plan.md`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `server`.
- [ ] `pnpm run typecheck` passes.
- [ ] `pnpm run test` passes with 2 tests.
- [ ] `pnpm run dev:server` boots on port 3000.
- [ ] `grep -rn "mdWare\|my-adapter\|my-plugin\|myGuard\|authorize.contributor" server/src` returns nothing.
- [ ] `DevToolsAdapter` is mounted only when `env.NODE_ENV !== 'production'`.

## Next

Story 2 — Drizzle foundation. Adds `drizzle-orm`, `better-sqlite3`, `jose`, and `drizzle-kit`; creates `server/src/db/schema.ts`, the `Database` service with `PRAGMA foreign_keys = ON` and WAL, and `SqliteAdapter` running `migrate()` in `beforeStart`.
