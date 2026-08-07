# Story 6 — Grouping and API Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The board view (`/tasks/grouped`), the drill-down (`/categories/:id/tasks`), and the hardening items deferred from Stories 4–5. This closes the API; Story 7 starts the web client.

**Tech Stack:** KickJS v6 (Express), Drizzle + better-sqlite3, Zod, Vitest, supertest.

---

## Three things established by probing, not assumption

**`db.query` works.** `relations()` from Story 5 is wired: `db.query` exposes
`users`, `categories`, `tasks`, `taskCategories`. Relational traversal is available.

**`db.query` results are CIRCULAR.** `task → taskCategories → task` back-references
mean `JSON.stringify` on a raw result throws `Converting circular structure to JSON`.
A handler returning them directly would 500 at serialization time, *after* the
query succeeded — so it fails somewhere unrelated to the cause. **Map to a flat
response shape before returning.**

**Route order matters.** `/tasks/grouped` must be declared **before** `/tasks/:id`
in the controller, or the param route swallows the literal and `grouped` arrives
as an id. The current controller declares `@Get('/')` then `@Get('/:id')` — insert
grouped between them.

## Global Constraints

- pnpm only. Commands from `/home/forinda/Desktop/adero-api`; **`pwd` first**.
- Use the `@/` alias for anything outside the current folder. It is wired in `vite.config.ts`, `tsconfig.json` **and** `vitest.config.ts`.
- `ownerId` is a required positional parameter on every repository method.
- Another user's row: **404**, body identical to a genuinely-missing id.
- Validation failures are **422**. Zod 4: `z.email()`.
- No `as const` on a `QueryFieldConfig`.
- `db.transaction()` is **synchronous** — no `await` inside.
- `createTestApp({ isolated: true })` returns a different container than adapters use. Never pass `isolated` alongside adapters.
- Import `authRateLimitStore` from `@/modules/auth/auth.controller` and `resetAll()` in `beforeEach` where a suite signs up repeatedly.
- Never spread a database row into a response.

---

### Task 1: `GET /tasks/grouped`

The board view. Per `plan.md` §7: **not paginated** — a board wants whole columns —
but capped so it cannot become an unbounded scan.

**Files:**
- Modify: `server/src/modules/tasks/tasks.repository.ts`, `tasks.service.ts`, `tasks.controller.ts`
- Create: `server/src/modules/tasks/__tests__/grouped.test.ts`

**Interfaces:**
- Produces: `listGrouped(ownerId: string, cap: number): Array<{ category: Category | null; tasks: Task[] }>` on the repository, and `GET /api/v1/tasks/grouped` returning `[{ category, tasks }]` with the uncategorized bucket **last**.

- [ ] **Step 1: Write the failing test**

Cover:
- a task with one category appears under that category
- a task with **two** categories appears under **both** — this is a many-to-many board, so duplication across columns is correct, not a bug
- a task with no categories lands in the uncategorized bucket
- the uncategorized bucket is **last** in the array
- a category with no tasks still appears, with an empty `tasks` array — a board column that vanishes when emptied is a broken board
- Bob's grouped view contains none of Alice's tasks **and** none of Alice's categories
- the response serializes — assert on `JSON.parse(JSON.stringify(body))` somewhere, or simply that the HTTP call returns 200, which exercises serialization
- the cap: create more than the cap and assert the total returned is bounded

Represent the uncategorized bucket as `{ category: null, tasks: [...] }`. Decide
that shape now and keep it — the client will branch on it.

- [ ] **Step 2: Confirm RED**

- [ ] **Step 3: Implement**

Two viable approaches. **Prefer the explicit join** unless you find a reason not to:

```ts
  listGrouped(ownerId: string, cap: number) {
    // Explicit join rather than db.query: the relational API returns circular
    // objects (task -> taskCategories -> task) that cannot be serialized, so
    // they would need flattening anyway, and the join makes the owner
    // predicate visible on both sides.
    const rows = this.database.db
      .select({ task: tasks, categoryId: taskCategories.categoryId })
      .from(tasks)
      .leftJoin(taskCategories, eq(taskCategories.taskId, tasks.id))
      .where(eq(tasks.ownerId, ownerId))
      .orderBy(asc(tasks.createdAt))
      .limit(cap)
      .all()
    …
  }
```

Then fetch the owner's categories separately and assemble. Note the cap applies
to **joined rows**, not distinct tasks — a task in three categories consumes
three. Say so in a comment; it is the honest reading and the client should not
be surprised.

**The owner predicate must appear on the category fetch too.** Joining on
`taskCategories` alone does not scope categories — a category belongs to a user
independently of any task.

- [ ] **Step 4: Confirm GREEN, then mutation-verify**

Remove the owner predicate from the grouped query; confirm the cross-user test
fails; restore. Quote both outcomes.

- [ ] **Step 5: Wire the route — BEFORE `/:id`**

```ts
  @Get('/grouped')
  async grouped(ctx: Ctx) { … }

  @Get('/:id')
  async byId(ctx: Ctx) { … }
```

Add a test that `GET /api/v1/tasks/grouped` returns the board and **not** a 404
from the id route — if the order is wrong, `grouped` is read as an id and the
symptom is a confusing 404 rather than an obvious routing error.

- [ ] **Step 6: Commit** — `feat: add GET /tasks/grouped board view`

---

### Task 2: `GET /categories/:id/tasks`

**Files:**
- Modify: `server/src/modules/categories/categories.controller.ts`, `categories.service.ts`, `categories.module.ts`
- Modify: `server/src/modules/tasks/tasks.repository.ts` (add the scoped lookup)
- Create: `server/src/modules/categories/__tests__/category-tasks.test.ts`

- [ ] **Step 1: Add the repository method**

```ts
  listByCategory(
    ownerId: string,
    categoryId: string,
    parsed: ParsedQuery,
  ): { data: Task[]; total: number }
```

Scoped by **both** `tasks.ownerId` and the join to `categoryId`. Do not rely on
the category's ownership implying the task's — check both explicitly.

- [ ] **Step 2: Cross-module wiring**

`CategoriesService` injects `TasksRepository`. DI resolves by type regardless of
module, so this needs no registration — but it is the project's first
cross-module dependency, so note it in a comment: categories owns the route
because the URL is category-shaped, while tasks owns the data.

If you would rather avoid the coupling, the alternative is a `?categoryId=`
filter on `/tasks`. **Do not silently switch** — the design specifies the nested
route. If you think the alternative is better, say so in your report and keep the
specified behaviour.

- [ ] **Step 3: Tests**

- returns only tasks in that category, paginated, with `total` scoped correctly
- a category with no tasks returns an empty page, not a 404
- **another user's category id → 404**, body identical to a nonexistent id
- a task in two categories appears under both when each is queried
- 401 without a token

- [ ] **Step 4: Commit** — `feat: add GET /categories/:id/tasks`

---

### Task 3: Deferred hardening from Stories 4–5

Four items, each already diagnosed. Do not re-litigate them; implement and test.

- [ ] **Step 1: One transaction for `PUT /tasks/:id`**

`TasksService.update` currently calls `repo.update` and `repo.replaceCategories`
as **two** transactions. The duplicate-id 500 that made this reachable is fixed,
but the invariant is still absent: any future failure in the link step leaves the
column patch committed.

Add `updateWithCategories(id, ownerId, patch, categoryIds | undefined)` to the
repository doing both inside one `db.transaction`, and have the service call it.
Synchronous, as always.

Test: force a failure in the link step (a nonexistent category id, bypassing the
service's validation by calling the repository directly) and assert the column
patch did **not** apply.

- [ ] **Step 2: `Object.hasOwn` for the sort allow-list**

`tasks.repository.ts` uses `sort.field in SORTABLE`, which walks the prototype
chain — `constructor`, `toString` and friends are "in" any object. Unreachable
today because the framework's allow-list drops unknown fields first, but the
comment claims defence in depth and `in` does not provide it.

Change to `Object.hasOwn(SORTABLE, sort.field)`. Same in
`categories.repository.ts`. Add a direct repository test passing
`{ field: 'constructor', direction: 'asc' }` and asserting it falls back to the
default ordering rather than throwing.

- [ ] **Step 3: Decide the LIKE wildcard question, and write it down**

`%` and `_` in a search term are treated as wildcards: `?q=_nrelated` matches
`unrelated`. The audit confirmed **no scope escape** — `?q=%` returns only the
caller's own rows, and the query is parameterized so there is no injection. The
blast radius is the caller's own data.

So this is a product decision, not a defect. Pick one and record it in `plan.md`:

- **Treat as a feature** — leave it, document that search supports `%` and `_`.
- **Treat as literal** — escape them and add `ESCAPE '\'` to the LIKE.

Recommended: **escape them.** Users type `_` in ordinary words and will not
expect wildcard behaviour; a surprising match is worse than a missing feature.
Either way, add a test asserting the chosen behaviour so it stops being ambiguous.

- [ ] **Step 4: Commit** — `fix: single-transaction task update, hasOwn allow-list, literal search`

---

### Task 4: Swagger, cascade verification, and the README

- [ ] **Step 1: Security annotations across every module**

Tasks and categories controllers should carry class-level `@ApiBearerAuth()`;
auth's public routes carry `@ApiPublic()`. Verify by booting the dev server and
reading `/openapi.json`:

```bash
cd /home/forinda/Desktop/adero-api
(cd server && NODE_ENV=development PORT=3200 timeout 20 pnpm exec kick dev > /tmp/sw.log 2>&1 &)
sleep 12
curl -s http://localhost:3200/openapi.json | python3 -c "
import json,sys
spec=json.load(sys.stdin)
for path,ops in sorted(spec.get('paths',{}).items()):
    for m,op in ops.items():
        print(f'{m.upper():6} {path:34} security={op.get(\"security\")}')
"
```

Every route except `/auth/signup` and `/auth/login` must show
`[{'BearerAuth': []}]`. **Quote the actual table in your report** — this is the
one place the API's security posture is visible in one view.

- [ ] **Step 2: Tags and descriptions**

`@ApiTags` on each controller; a one-line description on each route explaining
what it does and any non-obvious behaviour (grouped is uncapped-per-column but
capped overall; a task can appear in several columns).

- [ ] **Step 3: End-to-end cascade verification**

An HTTP-level test, not a repository one:

- delete a category → its tasks survive, and their `categoryIds` no longer list it
- delete a task → its links vanish, categories survive
- attempting to delete a **user** with tasks fails — `ON DELETE restrict`. There is no user-delete endpoint, so exercise this at the repository level and note that the endpoint, when added, must clear tasks and categories first in a transaction.

- [ ] **Step 4: README**

Update the root `README.md`: what the API does, how to run it, the route table,
and the environment variables with their meaning. Mention that `.env.example`'s
`JWT_SECRET` is deliberately empty so `cp` fails loudly.

- [ ] **Step 5: Commit** — `docs: complete Swagger security annotations and README`

---

## Done when

- [ ] `pnpm run typecheck` clean; `pnpm run test` green and pristine.
- [ ] `GET /tasks/grouped` returns board columns with the uncategorized bucket last, empty categories included, and a task in two categories under both.
- [ ] `/tasks/grouped` resolves as a literal, not as `/tasks/:id` — asserted.
- [ ] `GET /categories/:id/tasks` paginates, and another user's category id returns a 404 identical to a nonexistent one.
- [ ] `PUT /tasks/:id` applies the column patch and the link replacement in **one** transaction — verified by forcing a link failure and asserting the patch did not apply.
- [ ] The sort allow-list uses `Object.hasOwn`; `field: 'constructor'` falls back to the default order.
- [ ] Search treats `%` and `_` per the recorded decision, with a test.
- [ ] `/openapi.json` shows `BearerAuth` on every route except signup and login — table quoted.
- [ ] Removing an owner predicate fails the grouped isolation test — verified, not assumed.

## Deliberately not in this story

- No task reordering, no drag-and-drop persistence — Story 12 handles the UI, and column position is not modelled.
- No per-category task counts on `/categories` — the client can derive them.
- No cursor pagination.

## Carried forward

- Rate limiting is per-process in-memory; `KvRateLimitStore` before scaling out.
- Token revocation — a leaked token cannot be killed before `exp`.
- `DATABASE_URL` is relative to `cwd`; a footgun for the eventual Dockerfile.
- An unknown filter **field** is silently dropped (200, unfiltered) while a bad filter **value** is 422. Surfacing dropped fields via `parseFilters`' `onReject` hook is a product call.
