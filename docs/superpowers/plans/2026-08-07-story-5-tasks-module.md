# Story 5 — Tasks Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner-scoped task CRUD with a filterable, sortable, searchable paginated list, and many-to-many category links written atomically.

**Architecture:** Same ownership pattern as categories — `ownerId` required on every repository method, module-level `CurrentUser`. The new shape is the join table: attaching categories is a multi-statement write that must be atomic and must verify the caller owns every category involved.

**Tech Stack:** KickJS v6 (Express), Drizzle + better-sqlite3, Zod, Vitest, supertest.

---

## Two things that will bite if you skim

**`db.transaction()` is SYNCHRONOUS on better-sqlite3.** The signature is
`transaction<T>(fn: (tx) => T): T` — it returns `T`, not `Promise<T>`. Passing an
`async` callback returns a promise the driver never awaits, so statements land
*outside* the transaction and a failure part-way leaves the row written and the
links missing. **No `await` inside the transaction callback.** Hash passwords,
resolve ids, do every async thing *before* opening it.

**`FilterItem.value` is always a `string`.** `?filter=priority:eq:high` arrives as
`{ field: 'priority', operator: 'eq', value: 'high' }`. A value outside the enum
must be rejected, not silently passed to SQL — and the choice between "return
nothing" and "ignore the filter" is a real decision, not an implementation detail.
This plan rejects with 422, because a filter that silently matches everything is
how a client ends up showing one user's board to another.

## Global Constraints

- pnpm only. All commands from `/home/forinda/Desktop/adero-api`; **run `pwd` first**.
- `@Value` is `PropertyDecorator` only — use `@Inject(ConfigService)` or `getEnv()`.
- Repository methods take `ownerId` as a **required positional parameter**.
- Another user's row returns **404, not 403**, with a body identical to a genuinely-missing id.
- Never spread a database row into a response.
- Validation failures are **422**, not 400.
- Zod 4: `z.email()`, not `z.string().email()`.
- Do not use `as const` on a `QueryFieldConfig` — it declares mutable `string[]` and a readonly tuple is not assignable.

## Story 4 context

- `CategoriesRepository` is the model to follow: `listPaginated(ownerId, parsed)`, `findById(id, ownerId)`, `create(ownerId, input)`, `update(id, ownerId, patch)`, `remove(id, ownerId)`.
- `CategoriesService` converts unique violations to 409 via `isUniqueViolation`, and repository `null` to 404.
- Module-level auth: `contributors() { return [CurrentUser.registration] }`.
- `createTestApp({ isolated: true })` hands back a **different container** than adapters and routes use. Do not pass `isolated` alongside adapters.
- The auth rate limiter shares one counter per module; `authRateLimitStore.resetAll()` in `beforeEach` if a test file drives signup repeatedly.

---

## File Structure

| Path | Responsibility |
|---|---|
| `server/src/db/schema/relations.ts` | Drizzle `relations()` for tasks ↔ categories. Enables Story 6's `db.query`. |
| `server/src/modules/tasks/tasks.repository.ts` | Owner-scoped CRUD, filter/sort/search translation, transactional category links. |
| `server/src/modules/tasks/tasks.service.ts` | Repository nulls → 404; unknown/unowned category ids → 422. |
| `server/src/modules/tasks/tasks.controller.ts` | Five routes, class-level bearer security. |
| `server/src/modules/tasks/tasks.module.ts` | Mounts `/tasks`, registers `CurrentUser` module-wide. |
| `server/src/modules/tasks/tasks.constants.ts` | The query allow-list, in one place. |
| `server/src/modules/tasks/dtos/create-task.dto.ts`, `update-task.dto.ts` | Zod schemas built from the enum arrays. |
| `server/src/modules/tasks/__tests__/` | repository, links, controller, isolation. |

---

### Task 1: Relations and the tasks repository

**Files:**
- Create: `server/src/db/schema/relations.ts`, `server/src/modules/tasks/tasks.repository.ts`, `__tests__/tasks.repository.test.ts`
- Modify: `server/src/db/schema/index.ts`

**Interfaces:**
- Produces:
  ```ts
  listPaginated(ownerId: string, parsed: ParsedQuery): Promise<{ data: Task[]; total: number }>
  findById(id: string, ownerId: string): Promise<Task | null>
  create(ownerId: string, input: CreateTaskInput): Promise<Task>
  update(id: string, ownerId: string, patch: UpdateTaskPatch): Promise<Task | null>
  remove(id: string, ownerId: string): Promise<boolean>
  ```
  Task 2 adds the link methods; Tasks 3-4 consume all of it.

- [ ] **Step 1: Declare the relations**

Create `server/src/db/schema/relations.ts`:

```ts
import { relations } from 'drizzle-orm'
import { categories } from './categories'
import { taskCategories } from './task-categories'
import { tasks } from './tasks'
import { users } from './users'

// Declared for Story 6's `db.query.tasks.findMany({ with: { categories: true } })`.
// Drizzle's relational API needs these even though the foreign keys already
// exist — the FKs constrain the data, `relations()` describes the shape.
export const usersRelations = relations(users, ({ many }) => ({
  tasks: many(tasks),
  categories: many(categories),
}))

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  owner: one(users, { fields: [tasks.ownerId], references: [users.id] }),
  taskCategories: many(taskCategories),
}))

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  owner: one(users, { fields: [categories.ownerId], references: [users.id] }),
  taskCategories: many(taskCategories),
}))

export const taskCategoriesRelations = relations(taskCategories, ({ one }) => ({
  task: one(tasks, { fields: [taskCategories.taskId], references: [tasks.id] }),
  category: one(categories, {
    fields: [taskCategories.categoryId],
    references: [categories.id],
  }),
}))
```

Export them from `server/src/db/schema/index.ts` and add them to the `schema`
object — `drizzle(connection, { schema })` needs relations in the same object for
`db.query` to work.

**Then run `pnpm --filter ./server run db:generate` and confirm it reports NO
schema changes.** `relations()` is a TypeScript-level declaration; if it emits a
migration, something else drifted and you must read the SQL before continuing.

- [ ] **Step 2: Write the failing repository test**

`__tests__/tasks.repository.test.ts`. Seed two owners as in the categories tests.
Cover:

- create/find within owner; `findById` returns null for another owner's task
- `listPaginated` returns only the caller's tasks, with `total` scoped to the owner
- update and remove only within the owner
- **filter by status** — `{ field: 'status', operator: 'eq', value: 'done' }` returns only done tasks
- **filter by priority**, same shape
- **two filters combined** narrow rather than widen
- **search** matches title *and* description, and never escapes the owner scope
- **sort by priority** orders `high` before `medium` before `low` — not alphabetically, which would give high, low, medium

That last one matters. `priority` is a text column, so a naive `ORDER BY priority`
sorts alphabetically and looks plausible while being wrong. Assert the semantic
order explicitly.

- [ ] **Step 3: Run it and confirm RED**

- [ ] **Step 4: Write the repository**

Model it on `CategoriesRepository`. Additions:

```ts
const SORTABLE = {
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  title: tasks.title,
} as const

// Text column, so ORDER BY is alphabetical: high, low, medium. Map to a rank
// so "sort by priority" means what a user expects.
const PRIORITY_RANK = sql`CASE ${tasks.priority}
  WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`

const STATUS_RANK = sql`CASE ${tasks.status}
  WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END`
```

Filter translation must be an **allow-list switch**, never a lookup that passes
an arbitrary field name into SQL:

```ts
function filterCondition(filter: FilterItem): SQL | undefined {
  switch (filter.field) {
    case 'status':
      return TASK_STATUSES.includes(filter.value as TaskStatus)
        ? eq(tasks.status, filter.value as TaskStatus)
        : undefined
    case 'priority':
      return TASK_PRIORITIES.includes(filter.value as TaskPriority)
        ? eq(tasks.priority, filter.value as TaskPriority)
        : undefined
    default:
      return undefined
  }
}
```

Return `undefined` for an unrecognised field or an out-of-enum value; the service
rejects those before they reach here (Task 3), so this is defence in depth rather
than the primary guard.

The owner predicate is the base of the `and(...)`, never appended after — so no
combination of filters can produce a query without it.

- [ ] **Step 5: Confirm GREEN, then verify the scope is load-bearing**

Temporarily drop the owner predicate from `listPaginated` and confirm the
"only the caller's tasks" case fails. Restore. Quote both outcomes.

- [ ] **Step 6: Commit** — `feat: add drizzle relations and owner-scoped tasks repository`

---

### Task 2: Transactional category links

The part with real failure modes. Read the synchronous-transaction warning at the
top of this plan again before starting.

**Files:**
- Modify: `tasks.repository.ts`
- Create: `__tests__/task-links.test.ts`

**Interfaces:**
- Produces:
  ```ts
  createWithCategories(ownerId: string, input: CreateTaskInput, categoryIds: string[]): Task
  replaceCategories(taskId: string, ownerId: string, categoryIds: string[]): boolean
  findCategoryIds(taskId: string): string[]
  ownedCategoryIds(ownerId: string, ids: string[]): string[]   // which of `ids` this owner actually holds
  ```
  Note these are **synchronous** — they run inside `db.transaction`, which cannot await.

- [ ] **Step 1: Write the failing tests**

- creating a task with two category ids writes exactly two join rows
- `replaceCategories` replaces wholesale: `[a,b]` then `[b,c]` leaves exactly `b,c`
- replacing with `[]` removes all links and leaves the task
- **a failure part-way writes nothing** — call `createWithCategories` with one valid and one nonexistent category id, expect it to throw, then assert **no task row exists**. This is the case that proves atomicity; without the transaction the task is written and the links are not.
- `ownedCategoryIds` returns only ids belonging to that owner, given a mix of the owner's, another owner's, and a nonexistent id
- deleting a task removes its join rows but leaves the categories (the schema's `ON DELETE cascade` on the join, verified end to end)

- [ ] **Step 2: Confirm RED**

- [ ] **Step 3: Implement**

```ts
  createWithCategories(ownerId: string, input: CreateTaskInput, categoryIds: string[]): Task {
    // Synchronous throughout: better-sqlite3's transaction() does not await.
    // Anything async must happen before this call.
    return this.database.db.transaction((tx) => {
      const [task] = tx.insert(tasks).values({ ...input, ownerId }).returning().all()

      if (categoryIds.length > 0) {
        tx.insert(taskCategories)
          .values(categoryIds.map((categoryId) => ({ taskId: task.id, categoryId })))
          .run()
      }

      return task
    })
  }
```

`replaceCategories` deletes the task's join rows then inserts the new set, in one
transaction. Verify the task belongs to the owner *inside* the transaction and
return `false` if not, so a concurrent delete cannot slip between check and write.

- [ ] **Step 4: Confirm GREEN, then prove atomicity is real**

Temporarily replace `this.database.db.transaction((tx) => …)` with a plain
sequence using `this.database.db` directly, and confirm the "failure writes
nothing" case fails — an orphaned task row survives. Restore. Quote both outcomes.

**If it still passes without the transaction, the test is not testing atomicity**
— most likely the invalid id is rejected before any write. Make the failing
insert happen *after* the task insert.

- [ ] **Step 5: Commit** — `feat: write task category links atomically`

---

### Task 3: DTOs, service, controller, module

**Files:**
- Create: `dtos/create-task.dto.ts`, `dtos/update-task.dto.ts`, `tasks.constants.ts`, `tasks.service.ts`, `tasks.controller.ts`, `tasks.module.ts`
- Modify: `server/src/modules/index.ts`

- [ ] **Step 1: DTOs built from the enum arrays**

```ts
import { TASK_PRIORITIES, TASK_STATUSES } from '../../../db/schema'

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  // From the same const arrays the column's $type<> uses — one source of truth.
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  categoryIds: z.array(z.string().min(1)).max(20).optional(),
})
```

The `max(20)` on `categoryIds` is a bound on how much work one request can cause,
not a business rule. Update's schema is the same with everything optional plus the
non-empty-patch `.refine`.

- [ ] **Step 2: The query allow-list**

`tasks.constants.ts`:

```ts
// No `as const` — QueryFieldConfig declares mutable string[].
export const TASK_QUERY_CONFIG = {
  filterable: ['status', 'priority'],
  sortable: ['createdAt', 'updatedAt', 'priority', 'status', 'title'],
  searchable: ['title', 'description'],
}
```

- [ ] **Step 3: Service**

Two responsibilities beyond the categories pattern:

**Validate category ids before writing.** Call `ownedCategoryIds`, compare
lengths, and on mismatch throw `HttpException.unprocessable` listing the
offending ids:

```ts
    const owned = this.repo.ownedCategoryIds(ownerId, categoryIds)
    const rejected = categoryIds.filter((id) => !owned.includes(id))
    if (rejected.length > 0) {
      // Unknown and unowned are reported identically — a distinct message would
      // let a client probe for other users' category ids.
      throw HttpException.unprocessable(`Unknown category: ${rejected.join(', ')}`)
    }
```

**Reject out-of-enum filter values.** `parsed.filters` carries raw strings. A
filter naming a known field with a value outside the enum must 422 rather than
silently match nothing — silently returning an empty list looks identical to
"you have no tasks", and the client cannot tell.

- [ ] **Step 4: Controller and module**

Five routes; `ownerId` from `ctx.require('currentUser')` on every one. Class-level
`@ApiBearerAuth()`. Module registers `CurrentUser` via `contributors()`.

Mount in `server/src/modules/index.ts` after `CategoriesModule`.

- [ ] **Step 5: Verify** — `pnpm run typecheck` clean, `pnpm run test` green.

- [ ] **Step 6: Commit** — `feat: add tasks controller, service, and module`

---

### Task 4: HTTP behaviour and isolation

**Files:**
- Create: `__tests__/tasks.controller.test.ts`, `__tests__/isolation.test.ts`

- [ ] **Step 1: Controller tests**

- create with and without `categoryIds`; 201, no `ownerId` in the body
- create with an unknown category id → **422**, and **no task is created** (list is empty afterwards)
- create with *another user's* category id → 422, with a body identical to the unknown-id case
- update replaces the category set wholesale
- filter by status and by priority; combined filters narrow
- an out-of-enum filter value → 422
- an unknown filter field is **ignored**, not an error — document whichever the framework does, after observing it
- sort by priority gives high → medium → low
- search matches description as well as title
- all five routes 401 without a token

- [ ] **Step 2: Isolation tests**

Two users, one app. Bob cannot see, fetch, update, or delete Alice's task; the
404 bodies are identical to a genuinely-missing id; Bob cannot attach Alice's
category to his own task.

- [ ] **Step 3: Mutation-verify the isolation suite**

Drop the owner predicate from the task list scope, confirm the leak test fails,
restore. Quote both outcomes.

- [ ] **Step 4: Commit** — `test: prove task isolation and category-link validation`

---

## Done when

- [ ] `pnpm run typecheck` clean; `pnpm run test` green and pristine.
- [ ] All five task routes 401 without a token.
- [ ] Bob cannot read, fetch, update, or delete Alice's task — 404, bodies identical to a missing id.
- [ ] Bob cannot attach Alice's category; unknown and unowned ids are indistinguishable in the response.
- [ ] A failed category link leaves **no** task row — verified by removing the transaction and watching the test fail.
- [ ] Sorting by priority yields high → medium → low, not alphabetical.
- [ ] An out-of-enum filter value returns 422 rather than an empty list.
- [ ] `db:generate` reports no schema change after adding relations.
- [ ] Removing the owner predicate fails the isolation suite — verified, not assumed.

## Deliberately not in this story

- No `/tasks/grouped` and no `/categories/:id/tasks` — Story 6.
- No assignees, due dates, comments, or attachments.
- No bulk edit and no reordering.
- No cursor pagination; offset is adequate at this scale.

## Carried forward

- Rate limiting is per-process in-memory; `KvRateLimitStore` before scaling out.
- Token revocation — a leaked token cannot be killed before `exp`.
- `DATABASE_URL` is relative to `cwd`; a footgun for the eventual Dockerfile.
