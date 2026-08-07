# Story 7 — Web App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React SPA in `web/` that talks to the API through a typed client whose types come from the server's own route generation — served by the API in production, proxied by Vite in development.

**Architecture:** `web/` is a second workspace package. `@forinda/kickjs-client` is generic over `KickApi`, an ambient type `kick typegen` emits — so a renamed route or a changed Zod body becomes a **compile error in the web package**, not a runtime 404. No hand-written API types, no contracts package.

`SpaAdapter` serves the built bundle in production, so the app is one process and one deploy, same-origin in both environments. **No CORS anywhere.**

**Tech Stack:** React 19, Vite, Tailwind v4, React Router 8, TanStack Query 5, `@forinda/kickjs-client` 0.3.

---

## What was established by testing, not assumption

**`SpaAdapter` works, and all six behaviours were verified** against a fake build directory before this plan was written:

| Probe | Result |
|---|---|
| `/` | serves `index.html` |
| `/app/board` (deep link) | 200 — client-side routing falls back correctly |
| `/assets/app.css` | 200 — static assets served |
| `/api/v1/nope` | **404 `application/problem+json`** — not swallowed by the fallback |
| `POST /api/v1/auth/signup` | 201 — the API still works behind it |
| `/docs` | 404 — the production gate survived adding an adapter |

That fourth row is the reason `apiPrefix` matters. Without it the SPA fallback returns `index.html` with a **200** for every mistyped API path, which is a miserable failure to debug.

**`SpaAdapter` is a CLASS. The published guide is wrong.** `https://kickjs.app/guide/spa.html` shows `SpaAdapter({ … })` as a factory. In 6.7.0 it is not. Runtime proof:

```
typeof: function
FACTORY CALL threw: Class constructor SpaAdapter cannot be invoked without 'new'
NEW: ok -> SpaAdapter
```

Mount it with **`new SpaAdapter({ … })`**. Every other adapter here is a factory — `SqliteAdapter()`, `DevToolsAdapter({})`, `SwaggerAdapter({})` — so this one reads wrong and will tempt someone to "fix" it. It imports fine from `@forinda/kickjs`; the guide's `@forinda/kickjs/spa` path also exists.

**Options and defaults**, from the installed type declaration: `clientDir` (`'dist/client'`), `apiPrefix` (`'/api'`, accepts an array), `exclude` (`[]`), `cacheControl` (`'public, max-age=31536000, immutable'`), `indexCacheControl` (`'no-cache'` — so a deploy is picked up immediately while hashed assets stay cached).

**`KickApi` exists and covers all 14 routes.** `server/.kickjs/types/kick__routes.ts` declares `namespace KickRoutes { interface Api { 'GET /tasks/grouped': …, … } }` plus `type KickApi = KickRoutes.Api`. Keys are `'<METHOD> <path>'` with `:id` params.

**Those types are GITIGNORED.** A fresh clone has no `KickApi` until `kick typegen` runs in `server/`. The root `build` and `typecheck` must run `server` before `web`. The server's `typecheck` is already `kick typegen && tsc --noEmit`, so ordering is sufficient.

**Tailwind v4 is CSS-first.** No `tailwind.config.js`, no `postcss.config.js` — the `@tailwindcss/vite` plugin plus `@import "tailwindcss";`, with theme values in an `@theme` block.

**Verified versions:** tailwindcss / @tailwindcss/vite 4.3.3, @tanstack/react-query 5.101.4, react-router 8.3.0, @forinda/kickjs-client 0.3.0.

## Global Constraints

- pnpm only. Commands from `/home/forinda/Desktop/adero-api`; **`pwd` first**.
- The server package is finished and must not change, except the `SpaAdapter` mount in Task 4.
- `web/` gets its own `tsconfig.json` — no shared base. The server needs `experimentalDecorators`; `web` does not.
- Never commit on a red typecheck.
- `web/dist/`, `node_modules/`, `.env` stay gitignored.

## Reference

`/home/forinda/Desktop/adero-fullstack/web/` is a working example of the client wiring — read its `src/api.ts`, `src/types/kick-routes.d.ts`, and `vite.config.ts`. Note it does **not** use `SpaAdapter` (its server mounts no adapters at all) and has no Tailwind, Router, or Query. We deviate deliberately on serving; the client wiring is the part to copy.

---

### Task 1: The workspace package

**Files:** create `web/{package.json,vite.config.ts,tsconfig.json,index.html,.gitignore}`, `web/src/{main.tsx,App.tsx}`; modify `pnpm-workspace.yaml`, root `package.json`.

- [ ] **Step 1: Add `web` to the workspace**

`pnpm-workspace.yaml` lists only `server`. Add `- web`, leaving `allowBuilds` and `minimumReleaseAgeExclude` untouched. Root `package.json` gains `"web"` in `workspaces` and a `dev:web` script. `dev` already fans out with `--parallel -r`.

- [ ] **Step 2: Scaffold**

`web/package.json` — name `adero-api-web`, private, `type: module`.
Dependencies: `react`, `react-dom`, `@forinda/kickjs-client`, `@tanstack/react-query`, `react-router`.
Dev: `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `vite`, `typescript`, `tailwindcss`, `@tailwindcss/vite`.
Scripts: `dev`, `build` (`tsc --noEmit && vite build`), `preview`, `typecheck`.

- [ ] **Step 3: Vite config**

```ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The client's baseUrl is the relative '/api/v1', so the browser hits Vite
    // and Vite forwards. Same-origin in dev, same-origin in production
    // (SpaAdapter serves both) — which is why there is no CORS in this project.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
```

- [ ] **Step 4: A minimal app that renders**

`index.html`, `main.tsx`, an `App.tsx` rendering something identifiable. No routing or fetching yet — the deliverable is "builds and serves".

- [ ] **Step 5: Verify the proxy actually forwards**

```bash
cd /home/forinda/Desktop/adero-api
pnpm install
pnpm --filter ./web build
(pnpm dev > /tmp/dev.log 2>&1 &)
sleep 15
curl -s -o /dev/null -w 'vite: %{http_code}\n' http://localhost:5173/
curl -s -X POST http://localhost:5173/api/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"proxy@example.com","password":"hunter2hunter2","name":"P"}' \
  -o /dev/null -w 'proxied signup: %{http_code}\n'
```

Expected `vite: 200` and `proxied signup: 201`. A 404 on the second means Vite served its own `index.html` instead of forwarding — the proxy is not wired.

- [ ] **Step 6: Commit** — `feat: add web workspace package with vite dev proxy`

---

### Task 2: The typed client

The point of the story. Done right, the web package cannot call a route that does not exist.

**Files:** create `web/src/types/kick-routes.d.ts`, `web/src/api.ts`, `web/src/auth/token.ts`; modify root `package.json`.

- [ ] **Step 1: The type bridge**

```ts
// web/src/types/kick-routes.d.ts
// Type-only bridge to the server's generated route types. Erased at build time
// — no server code enters the web bundle. Regenerate with `kick typegen` in
// server/ (automatic under `kick dev`).
import '../../../server/.kickjs/types/kick__routes'
```

- [ ] **Step 2: The client**

```ts
// web/src/api.ts
import { createClient } from '@forinda/kickjs-client'
import { getToken } from './auth/token'

export const api = createClient<KickApi>({
  baseUrl: '/api/v1',
  // A factory, invoked per request — so a token stored after the client was
  // constructed is still picked up, and logout takes effect immediately.
  headers: () => {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
})
```

`KickApi` is ambient. Do **not** import it.

- [ ] **Step 3: Token storage, with the tradeoff written down**

`web/src/auth/token.ts` — `getToken`, `setToken`, `clearToken` over `localStorage`.

> **ponytail: `localStorage` is readable by any successful XSS.** Mitigations: React escapes by default and this codebase uses no `dangerouslySetInnerHTML`. The stronger design is an httpOnly refresh cookie plus a short-lived in-memory access token — a different auth design than `plan.md` §6, so revisit together, not piecemeal.

- [ ] **Step 4: Build ordering**

`KickApi` comes from gitignored generated files, and `pnpm -r` does not guarantee order. Make it explicit in the root `package.json`:

```json
"build": "pnpm --filter ./server build && pnpm --filter ./web build",
"typecheck": "pnpm --filter ./server typecheck && pnpm --filter ./web typecheck",
```

- [ ] **Step 5: Prove the types flow — check it NEGATIVELY**

Add a temporary file:

```ts
// web/src/__typecheck__.ts — DELETE after verifying
import { api } from './api'
export const good = () => api.get('/tasks/grouped')
export const bad = () => api.get('/tasks/not-a-real-route')
```

Run `pnpm --filter ./web typecheck`. The `bad` line **must** error. If it does not, `KickApi` resolved to `any` or `never` and the entire typed-client premise is broken — report BLOCKED rather than continuing, because everything downstream assumes it.

Delete the file, confirm typecheck is clean, then verify the clean-clone path:

```bash
rm -rf server/.kickjs && pnpm run typecheck
```

Must pass, because the server's typecheck regenerates first.

- [ ] **Step 6: Commit** — `feat: add typed API client bridged to server route types`

---

### Task 3: Styling, routing, and data-fetching shell

**Files:** create `web/src/index.css`, `web/src/router.tsx`, `web/src/query.ts`, placeholder route components; modify `main.tsx`, `App.tsx`.

- [ ] **Step 1: Tailwind v4**

```css
/* web/src/index.css */
@import "tailwindcss";

@theme {
  /* The accent sits in the violet family deliberately: priority and status need
     the warm and green ranges for meaning, so a red accent would fight a red
     "high priority" pill. See plan.md §12. */
  --color-accent: #6D4AFF;
  --color-accent-hover: #5B3AE0;
  --color-ink: #0E0E13;
  --color-muted: #6B6B7B;
  --color-hairline: #E6E6EF;
  --color-canvas: #FAFAFC;
}
```

No config files — v4 is CSS-first.

**Verify Tailwind actually compiles**: use `class="text-accent"` somewhere, build, and grep the emitted CSS for the custom property. A stylesheet that imports but never processes looks identical until nothing is styled.

- [ ] **Step 2: Router**

React Router 8. Routes for `/`, `/login`, `/signup`, `/app` — placeholders rendering their own name. Real screens are Stories 9–11.

Add a `ProtectedRoute` that redirects to `/login` when `getToken()` returns nothing. Story 10 wires real auth; the shape is settled now.

- [ ] **Step 3: TanStack Query**

`QueryClient` with the retry policy from `plan.md` §11:

```ts
retry: (count, error) =>
  error instanceof KickClientError && error.status < 500 ? false : count < 3,
```

A 4xx will not succeed on retry — retrying wastes time and, on login, burns the rate limit.

- [ ] **Step 4: One real query end to end**

Wire `/app` to fetch `api.get('/auth/me')` through Query and render the email, or "not signed in" on a 401. That exercises the whole chain — typed client, proxy, token, Query — in one visible place.

- [ ] **Step 5: Verify, and be honest about how**

Build, typecheck, boot both. Report exactly what you did. **Do not claim a UI works if you only proved it compiles** — if you could not drive a browser, say so and say what you checked instead (for example: the bundle contains the expected string, the query fires against the proxy).

- [ ] **Step 6: Commit** — `feat: add tailwind, router, and query shell`

---

### Task 4: Production serving

**Files:** modify `server/src/adapters/index.ts`, root `README.md`.

- [ ] **Step 1: Mount it**

```ts
import { SpaAdapter, getEnv } from '@forinda/kickjs'

  // A CLASS, not a factory — `new`, unlike every other adapter here. The
  // published guide at kickjs.app/guide/spa.html shows a factory call; that is
  // wrong for 6.7.0 and throws "Class constructor cannot be invoked without
  // 'new'". Verified at runtime.
  //
  // Production only: in development Vite serves the SPA and proxies to us, and
  // web/dist may not exist at all.
  ...(isProduction
    ? [
        new SpaAdapter({
          clientDir: resolve(import.meta.dirname, '../../../web/dist'),
          // Without these the fallback returns index.html with a 200 for every
          // mistyped API path, and for the docs surfaces.
          apiPrefix: '/api',
          exclude: ['/docs', '/redoc', '/openapi.json', '/_debug'],
        }),
      ]
    : []),
```

`clientDir` resolves from `import.meta.dirname`, not `process.cwd()`. **Check the depth for both forms** — unbundled it runs from `server/src/adapters/`, bundled from `server/dist/`. This is exactly the trap the migrations path hit in Story 2, where the bundled depth differed and the fallback silently picked the wrong directory.

- [ ] **Step 2: Verify all six behaviours**

```bash
cd /home/forinda/Desktop/adero-api
pnpm run build
rm -rf server/data
(cd server && NODE_ENV=production PORT=3300 timeout 30 node dist/index.js > /tmp/prod.log 2>&1 &)
sleep 10
echo "SPA root:      $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3300/)"
echo "deep link:     $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3300/app)"
echo "API 404:       $(curl -s -D- -o /dev/null http://localhost:3300/api/v1/nope | grep -i '^content-type')"
echo "signup:        $(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3300/api/v1/auth/signup -H 'content-type: application/json' -d '{"email":"prod@example.com","password":"hunter2hunter2","name":"P"}')"
echo "docs (gated):  $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3300/docs)"
```

All five matter: root and deep link `200`; the API 404 must be `application/problem+json`, **not** HTML; signup `201`; docs `404`.

- [ ] **Step 3: Confirm the gate is still load-bearing**

Boot the same build with `NODE_ENV=development` and confirm `/docs` returns 200. A gate that excludes in both modes is indistinguishable from one that works.

- [ ] **Step 4: README** — add `web/` to the layout, the dev workflow, and how production serving works.

- [ ] **Step 5: Commit** — `feat: serve the built SPA from the API in production`

---

## Done when

- [ ] `pnpm run typecheck` and `pnpm run test` pass from the root; server tests still 142.
- [ ] `pnpm dev` runs both; `localhost:5173/api/v1/...` reaches the API.
- [ ] `api.get('/tasks/not-a-real-route')` is a **compile error** — verified negatively.
- [ ] `rm -rf server/.kickjs && pnpm run typecheck` passes, proving build ordering.
- [ ] A production build serves the SPA at `/` and `/app`, returns problem+json for an unknown `/api/v1` path, and still serves the API.
- [ ] `/docs` is 404 in production, 200 in development.
- [ ] Tailwind's custom properties appear in the emitted CSS.

## Deliberately not in this story

- No landing page, auth screens, or board — Stories 9–11.
- No design system components — Story 8.
- No SSR, no server components.
- No CORS: same-origin in development via the proxy, in production via `SpaAdapter`.

## Carried forward

- `localStorage` token is XSS-readable; the httpOnly-cookie design is a whole-auth change.
- Rate limiting is per-process in-memory.
- `DATABASE_URL` is relative to `cwd` — a Dockerfile footgun, and the same question now applies to `clientDir`.
