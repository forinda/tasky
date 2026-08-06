# Story 4 — Categories Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner-scoped CRUD for categories, plus a paginated list — and with it, the first end-to-end proof that the ownership pattern actually isolates users.

**Architecture:** `CategoriesRepository` takes `ownerId` as a required parameter on every method and puts it in the `WHERE` clause. The `CurrentUser` contributor is registered at the **module** level here (unlike auth, where it was per-method), so every route on the module is protected by construction rather than by remembering a decorator.

**Tech Stack:** KickJS v6 (Express), Drizzle + better-sqlite3, Zod, Vitest, supertest.

## Global Constraints

- pnpm only. All commands from `/home/forinda/Desktop/adero-api`; **run `pwd` first** — a stray `cd server &&` persists and has caused wrong-directory incidents.
- **`@Value` is `PropertyDecorator` only** — `TS1239` on a constructor parameter, and a defaulted parameter still makes the container resolve `String`. Use `@Inject(ConfigService)` or `getEnv()`.
- Repository methods take `ownerId` as a **required positional parameter**, never optional, never defaulted. A method that *can* be called without an owner is a data leak waiting for the one caller that forgets.
- Another user's row returns **404, not 403**. A 403 confirms the row exists, which is an ID-enumeration oracle.
- `defineModule()` factory; module entry file is `<name>.module.ts`.
- `.kickjs/`, `dist/`, `data/`, `*.db*` are gitignored.
- Never spread a database row into a response. Build response shapes from an explicit field list.

## Story 3 context you need

- `server/src/contributors/current-user.contributor.ts` exports `CurrentUser`, a `ContextDecorator` with a `.registration` property. Handlers read `ctx.require('currentUser')`, typed as `PublicUser`.
- `PublicUser` and `toPublicUser` live in `server/src/modules/auth/auth.service.ts`.
- `server/src/test-setup.ts` registers the env schema for all tests via `setupFiles` — no per-file config import.
- Suite is at 41 tests.

### Traps carried forward — read before writing a test

**`createTestApp({ isolated: true })` hands back a different container than adapters and routes use.** `Application` takes `Container.getInstance()`. Do **not** pass `isolated` when passing adapters; resolve off `app.getContainer()` if you need the graph.

**A migration failure under test is silent** — the framework swallows `beforeStart` throws and `.env.test` sets `LOG_LEVEL=silent`. `no such table: categories` means migrations, not your code.

**Validation failures return 422, not 400.** Zod errors map to Unprocessable Entity.

**Zod 4 deprecates `z.string().email()`** in favour of `z.email()`. Same for other format helpers.

---

## File Structure

| Path | Responsibility |
|---|---|
| `server/src/modules/categories/categories.repository.ts` | `@Repository()` — the only place touching the `categories` table. Every method owner-scoped. |
| `server/src/modules/categories/categories.service.ts` | `@Service()` — maps repository nulls to HTTP exceptions, converts constraint violations. |
| `server/src/modules/categories/categories.controller.ts` | `@Controller()` — four routes, class-level bearer security. |
| `server/src/modules/categories/categories.module.ts` | `defineModule()` — mounts `/categories`, registers `CurrentUser` module-wide. |
| `server/src/modules/categories/dtos/create-category.dto.ts`, `update-category.dto.ts` | Zod request schemas. |
| `server/src/modules/categories/__tests__/categories.repository.test.ts` | Owner scoping, per-owner uniqueness. |
| `server/src/modules/categories/__tests__/categories.controller.test.ts` | HTTP CRUD, pagination. |
| `server/src/modules/categories/__tests__/isolation.test.ts` | Cross-user isolation. Its own file because it is the security proof. |

---

### Task 1: Owner-scoped repository

**Files:**
- Create: `server/src/modules/categories/categories.repository.ts`, `__tests__/categories.repository.test.ts`

**Interfaces:**
- Consumes: `Database` (Story 2), `categories` table and `Category` type from `server/src/db/schema`.
- Produces:
  ```ts
  listPaginated(ownerId: string, parsed: ParsedQuery): Promise<{ data: Category[]; total: number }>
  findById(id: string, ownerId: string): Promise<Category | null>
  create(ownerId: string, input: { name: string; color?: string | null }): Promise<Category>
  update(id: string, ownerId: string, patch: { name?: string; color?: string | null }): Promise<Category | null>
  remove(id: string, ownerId: string): Promise<boolean>
  ```
  Tasks 2-4 consume all five.

- [ ] **Step 1: Write the failing test**

Create `server/src/modules/categories/__tests__/categories.repository.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '../../../db/database'
import { users } from '../../../db/schema'
import { CategoriesRepository } from '../categories.repository'

const MIGRATIONS = resolve(import.meta.dirname, '../../../db/migrations')
const EMPTY_QUERY = { filters: [], sort: [], pagination: { limit: 20, offset: 0 }, search: '' }

let open: Database | undefined

afterEach(() => {
  open?.close()
  open = undefined
})

function fresh(): { repo: CategoriesRepository; database: Database } {
  const database = new Database(new ConfigService())
  open = database
  migrate(database.db, { migrationsFolder: MIGRATIONS })

  // Two owners, because every meaningful assertion here is about the boundary
  // between them.
  database.db
    .insert(users)
    .values([
      { id: 'owner-a', email: 'a@example.com', passwordHash: 'h', name: 'A' },
      { id: 'owner-b', email: 'b@example.com', passwordHash: 'h', name: 'B' },
    ])
    .run()

  return { repo: new CategoriesRepository(database), database }
}

describe('CategoriesRepository', () => {
  it('creates and finds a category for its owner', async () => {
    const { repo } = fresh()
    const created = await repo.create('owner-a', { name: 'Work' })

    expect(created.ownerId).toBe('owner-a')
    expect((await repo.findById(created.id, 'owner-a'))?.name).toBe('Work')
  })

  it('does not find another owner’s category', async () => {
    const { repo } = fresh()
    const created = await repo.create('owner-a', { name: 'Work' })

    expect(await repo.findById(created.id, 'owner-b')).toBeNull()
  })

  it('lists only the caller’s categories', async () => {
    const { repo } = fresh()
    await repo.create('owner-a', { name: 'Work' })
    await repo.create('owner-a', { name: 'Home' })
    await repo.create('owner-b', { name: 'Secret' })

    const { data, total } = await repo.listPaginated('owner-a', EMPTY_QUERY)

    expect(total).toBe(2)
    expect(data.map((c) => c.name).sort()).toEqual(['Home', 'Work'])
  })

  it('allows two owners to use the same category name', async () => {
    const { repo } = fresh()
    await repo.create('owner-a', { name: 'Work' })

    // The unique constraint is (ownerId, name), not name. If this throws, the
    // constraint is global and every user shares a namespace.
    await expect(repo.create('owner-b', { name: 'Work' })).resolves.toBeTruthy()
  })

  it('rejects a duplicate name for the same owner', async () => {
    const { repo } = fresh()
    await repo.create('owner-a', { name: 'Work' })

    await expect(repo.create('owner-a', { name: 'Work' })).rejects.toThrow(/UNIQUE/i)
  })

  it('updates only within the owner', async () => {
    const { repo } = fresh()
    const created = await repo.create('owner-a', { name: 'Work' })

    expect(await repo.update(created.id, 'owner-b', { name: 'Hijacked' })).toBeNull()
    expect((await repo.findById(created.id, 'owner-a'))?.name).toBe('Work')

    const updated = await repo.update(created.id, 'owner-a', { name: 'Renamed' })
    expect(updated?.name).toBe('Renamed')
  })

  it('deletes only within the owner', async () => {
    const { repo } = fresh()
    const created = await repo.create('owner-a', { name: 'Work' })

    expect(await repo.remove(created.id, 'owner-b')).toBe(false)
    expect(await repo.findById(created.id, 'owner-a')).not.toBeNull()

    expect(await repo.remove(created.id, 'owner-a')).toBe(true)
    expect(await repo.findById(created.id, 'owner-a')).toBeNull()
  })

  it('respects pagination limit and offset', async () => {
    const { repo } = fresh()
    for (const name of ['a', 'b', 'c', 'd', 'e']) await repo.create('owner-a', { name })

    const page = await repo.listPaginated('owner-a', {
      ...EMPTY_QUERY,
      pagination: { limit: 2, offset: 2 },
    })

    expect(page.data).toHaveLength(2)
    // total is the full owner-scoped count, not the page size — otherwise the
    // client cannot compute how many pages exist.
    expect(page.total).toBe(5)
  })
})
```

The two uniqueness cases are a matched pair. One proves the constraint exists; the other proves it is scoped to the owner rather than global. Either alone would pass against a wrong schema.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /home/forinda/Desktop/adero-api
pnpm --filter ./server exec vitest run src/modules/categories/__tests__/categories.repository.test.ts
```

Expected: FAIL — cannot resolve `../categories.repository`.

- [ ] **Step 3: Write the repository**

Create `server/src/modules/categories/categories.repository.ts`:

```ts
import { and, asc, count, desc, eq, like } from 'drizzle-orm'
import { Autowired, Repository, type ParsedQuery } from '@forinda/kickjs'
import { Database } from '../../db/database'
import { categories, type Category } from '../../db/schema'

export interface CreateCategoryInput {
  name: string
  color?: string | null
}

export interface UpdateCategoryPatch {
  name?: string
  color?: string | null
}

const SORTABLE = {
  name: categories.name,
  createdAt: categories.createdAt,
  updatedAt: categories.updatedAt,
} as const

/**
 * The only place in the app that touches the `categories` table.
 *
 * `ownerId` is a required parameter on every method, not an optional filter.
 * A method that can be called without an owner is a data leak waiting for the
 * one caller that forgets, and the compiler is a cheaper guard than a reviewer.
 */
@Repository()
export class CategoriesRepository {
  constructor(@Autowired() private readonly database: Database) {}

  async listPaginated(
    ownerId: string,
    parsed: ParsedQuery,
  ): Promise<{ data: Category[]; total: number }> {
    const scope = parsed.search
      ? and(eq(categories.ownerId, ownerId), like(categories.name, `%${parsed.search}%`))
      : eq(categories.ownerId, ownerId)

    const [sort] = parsed.sort
    const column = sort && sort.field in SORTABLE ? SORTABLE[sort.field as keyof typeof SORTABLE] : categories.createdAt
    const direction = sort?.direction === 'desc' ? desc : asc

    const data = this.database.db
      .select()
      .from(categories)
      .where(scope)
      .orderBy(direction(column))
      .limit(parsed.pagination.limit)
      .offset(parsed.pagination.offset)
      .all()

    // Counted against the same scope, so `total` is the owner's total rather
    // than the page length — the client needs it to compute page count.
    const [{ value: total }] = this.database.db
      .select({ value: count() })
      .from(categories)
      .where(scope)
      .all()

    return { data, total }
  }

  async findById(id: string, ownerId: string): Promise<Category | null> {
    const [row] = this.database.db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.ownerId, ownerId)))
      .all()
    return row ?? null
  }

  async create(ownerId: string, input: CreateCategoryInput): Promise<Category> {
    const [row] = this.database.db
      .insert(categories)
      .values({ ownerId, name: input.name, color: input.color ?? null })
      .returning()
      .all()
    return row
  }

  async update(
    id: string,
    ownerId: string,
    patch: UpdateCategoryPatch,
  ): Promise<Category | null> {
    const [row] = this.database.db
      .update(categories)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(categories.id, id), eq(categories.ownerId, ownerId)))
      .returning()
      .all()
    return row ?? null
  }

  async remove(id: string, ownerId: string): Promise<boolean> {
    const rows = this.database.db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.ownerId, ownerId)))
      .returning()
      .all()
    return rows.length > 0
  }
}
```

Note `update` and `remove` do their own ownership check inside the `WHERE` rather than reading first and then writing — one statement, no race between the check and the write.

The `sort.field` / `sort.direction` property names are assumed from `SortItem`. **Verify them against the type before running** — if they differ, use the real names and note it in your report.

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter ./server exec vitest run src/modules/categories/__tests__/categories.repository.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Verify suite and typecheck**

```bash
pnpm run typecheck
pnpm run test
```

Expected: both pass, 49 tests total.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add owner-scoped categories repository"
```

---

### Task 2: DTOs and service

**Files:**
- Create: `dtos/create-category.dto.ts`, `dtos/update-category.dto.ts`, `categories.service.ts`

**Interfaces:**
- Consumes: `CategoriesRepository` from Task 1.
- Produces: `CategoriesService` with `list`, `create`, `update`, `remove`, each taking `ownerId`. Task 3 consumes it.

- [ ] **Step 1: Write the DTOs**

`create-category.dto.ts`:

```ts
import { z } from 'zod'

export const createCategorySchema = z.object({
  name: z.string().min(1).max(120),
  // Hex colour or nothing. A free string here ends up rendered into markup by
  // the client, so constrain it at the boundary.
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour like #4F46E5')
    .optional(),
})

export type CreateCategoryDTO = z.infer<typeof createCategorySchema>
```

`update-category.dto.ts`:

```ts
import { z } from 'zod'

export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour like #4F46E5')
      .nullable()
      .optional(),
  })
  // An empty patch is a client bug, not a no-op success.
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Provide at least one field to update',
  })

export type UpdateCategoryDTO = z.infer<typeof updateCategorySchema>
```

- [ ] **Step 2: Write the service**

`categories.service.ts`:

```ts
import { Autowired, HttpException, Service, type ParsedQuery } from '@forinda/kickjs'
import type { Category } from '../../db/schema'
import { CategoriesRepository } from './categories.repository'
import type { CreateCategoryDTO } from './dtos/create-category.dto'
import type { UpdateCategoryDTO } from './dtos/update-category.dto'

/** Response shape. Explicit field list — never a spread of the row. */
export interface CategoryResponse {
  id: string
  name: string
  color: string | null
  createdAt: Date
  updatedAt: Date
}

export function toCategoryResponse(category: Category): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

@Service()
export class CategoriesService {
  constructor(@Autowired() private readonly repo: CategoriesRepository) {}

  async list(ownerId: string, parsed: ParsedQuery) {
    const { data, total } = await this.repo.listPaginated(ownerId, parsed)
    return { data: data.map(toCategoryResponse), total }
  }

  async create(ownerId: string, dto: CreateCategoryDTO): Promise<CategoryResponse> {
    try {
      return toCategoryResponse(await this.repo.create(ownerId, dto))
    } catch (error) {
      // Convert the constraint violation rather than pre-checking with a SELECT.
      // A read-then-write check loses the race between two concurrent requests;
      // the database is the only authority that cannot.
      if (isUniqueViolation(error)) {
        throw HttpException.conflict('A category with that name already exists')
      }
      throw error
    }
  }

  async update(id: string, ownerId: string, dto: UpdateCategoryDTO): Promise<CategoryResponse> {
    let updated: Category | null
    try {
      updated = await this.repo.update(id, ownerId, dto)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw HttpException.conflict('A category with that name already exists')
      }
      throw error
    }

    // 404, not 403 — a 403 would confirm the row exists and hand out an
    // ID-enumeration oracle. Missing and not-yours are indistinguishable here
    // by design.
    if (!updated) throw HttpException.notFound('Category not found')
    return toCategoryResponse(updated)
  }

  async remove(id: string, ownerId: string): Promise<void> {
    if (!(await this.repo.remove(id, ownerId))) {
      throw HttpException.notFound('Category not found')
    }
  }
}
```

> **Deliberate inconsistency with `AuthService.signup`, which pre-checks with a
> `findByEmail` before inserting.** That pre-check is racy — two concurrent
> signups can both pass it. Signup survives because the database constraint
> still fires, but it surfaces as a 500 rather than a 409. This service uses the
> catch-the-constraint approach instead, which is race-free. Worth aligning
> signup to match; recorded as a follow-up rather than changed here, because
> Story 3 is already reviewed and merged.

- [ ] **Step 3: Verify typecheck**

```bash
pnpm run typecheck
pnpm run test
```

Expected: both pass, still 49 tests (no new tests yet).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add categories DTOs and service"
```

---

### Task 3: Controller, module, and module-level authentication

**Files:**
- Create: `categories.controller.ts`, `categories.module.ts`, `__tests__/categories.controller.test.ts`
- Modify: `server/src/modules/index.ts`

**Interfaces:**
- Consumes: `CategoriesService` (Task 2), `CurrentUser` (Story 3).
- Produces: `CategoriesModule` mounted at `/categories`. Stories 5-6 mount alongside it.

- [ ] **Step 1: Write the controller**

```ts
import { Autowired, Controller, Delete, Get, Post, Put, reply, type Ctx } from '@forinda/kickjs'
import { ApiBearerAuth, ApiTags } from '@forinda/kickjs-swagger'
import { CategoriesService } from './categories.service'
import { createCategorySchema } from './dtos/create-category.dto'
import { updateCategorySchema } from './dtos/update-category.dto'

const QUERY_CONFIG = {
  sortable: ['name', 'createdAt', 'updatedAt'],
  searchable: ['name'],
} as const

// Class-level: every route here is protected. The inverse of AuthController,
// where two of three routes are public and the decorator went per-method.
@Controller()
@ApiTags('Categories')
@ApiBearerAuth()
export class CategoriesController {
  @Autowired() private readonly categories!: CategoriesService

  @Get('/')
  async list(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    return ctx.paginate((parsed) => this.categories.list(owner.id, parsed), QUERY_CONFIG)
  }

  @Post('/', { body: createCategorySchema, name: 'CreateCategory' })
  async create(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    return reply.created(await this.categories.create(owner.id, ctx.body))
  }

  @Put('/:id', { body: updateCategorySchema, name: 'UpdateCategory' })
  async update(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    return this.categories.update(ctx.params.id, owner.id, ctx.body)
  }

  @Delete('/:id')
  async remove(ctx: Ctx) {
    const owner = ctx.require('currentUser')
    await this.categories.remove(ctx.params.id, owner.id)
    return reply.noContent()
  }
}
```

Every handler derives `ownerId` from `ctx.require('currentUser')` — never from the body, never from a query parameter. An owner id accepted from the request is not an owner id.

- [ ] **Step 2: Write the module with module-level authentication**

```ts
import { defineModule } from '@forinda/kickjs'
import { CurrentUser } from '../../contributors/current-user.contributor'
import { CategoriesController } from './categories.controller'

import.meta.glob(
  ['./**/*.controller.ts', './**/*.service.ts', './**/*.repository.ts', '!./**/*.test.ts'],
  { eager: true },
)

export const CategoriesModule = defineModule({
  name: 'CategoriesModule',
  build: () => ({
    /**
     * Module-level, not per-method. Every route on this module requires a
     * token, so making it structural means a new route added later is
     * protected by default — the failure mode of per-method registration is
     * forgetting the decorator on exactly one handler, which no test would
     * notice unless someone thought to write it.
     */
    contributors() {
      return [CurrentUser.registration]
    },

    routes() {
      return { path: '/categories', controller: CategoriesController }
    },
  }),
})
```

- [ ] **Step 3: Mount it**

In `server/src/modules/index.ts`:

```ts
export const modules = defineModules().mount(AuthModule()).mount(CategoriesModule())
```

- [ ] **Step 4: Write the controller test**

Create `__tests__/categories.controller.test.ts`. A helper signs a user up and returns its token, because every route needs one:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { Container } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { SqliteAdapter } from '../../../adapters/sqlite.adapter'
import { AuthModule } from '../../auth/auth.module'
import { CategoriesModule } from '../categories.module'

beforeEach(() => {
  Container.reset()
})

// No `isolated: true` — see the trap note in the plan header.
async function appWithUser(email = 'a@example.com') {
  const app = await createTestApp({
    modules: [AuthModule(), CategoriesModule()],
    adapters: [SqliteAdapter()],
  })
  const res = await request(app.expressApp)
    .post('/api/v1/auth/signup')
    .send({ email, password: 'hunter2hunter2', name: 'A' })
  return { expressApp: app.expressApp, token: res.body.token as string }
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

describe('categories CRUD', () => {
  it('creates a category', async () => {
    const { expressApp, token } = await appWithUser()
    const res = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work', color: '#4F46E5' })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Work')
    // ownerId is an internal detail; it should not be echoed back.
    expect(res.body.ownerId).toBeUndefined()
  })

  it('rejects a duplicate name for the same user with 409', async () => {
    const { expressApp, token } = await appWithUser()
    await request(expressApp).post('/api/v1/categories').set(auth(token)).send({ name: 'Work' })
    const res = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work' })

    expect(res.status).toBe(409)
  })

  it('rejects a non-hex colour with 422', async () => {
    const { expressApp, token } = await appWithUser()
    const res = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work', color: 'red' })

    expect(res.status).toBe(422)
  })

  it('rejects an empty update patch with 422', async () => {
    const { expressApp, token } = await appWithUser()
    const created = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work' })

    const res = await request(expressApp)
      .put(`/api/v1/categories/${created.body.id}`)
      .set(auth(token))
      .send({})

    expect(res.status).toBe(422)
  })

  it('updates and deletes', async () => {
    const { expressApp, token } = await appWithUser()
    const created = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(token))
      .send({ name: 'Work' })

    const updated = await request(expressApp)
      .put(`/api/v1/categories/${created.body.id}`)
      .set(auth(token))
      .send({ name: 'Renamed' })
    expect(updated.status).toBe(200)
    expect(updated.body.name).toBe('Renamed')

    const deleted = await request(expressApp)
      .delete(`/api/v1/categories/${created.body.id}`)
      .set(auth(token))
    expect(deleted.status).toBe(204)
  })

  it('404s on updating a category that does not exist', async () => {
    const { expressApp, token } = await appWithUser()
    const res = await request(expressApp)
      .put('/api/v1/categories/no-such-id')
      .set(auth(token))
      .send({ name: 'X' })

    expect(res.status).toBe(404)
  })

  it('returns a paginated envelope', async () => {
    const { expressApp, token } = await appWithUser()
    for (const name of ['a', 'b', 'c']) {
      await request(expressApp).post('/api/v1/categories').set(auth(token)).send({ name })
    }

    const res = await request(expressApp).get('/api/v1/categories?limit=2').set(auth(token))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    // The envelope shape is part of the contract the typed client depends on.
    expect(res.body).toHaveProperty('meta')
  })

  it('401s on every route without a token', async () => {
    const { expressApp } = await appWithUser()

    // Proves the module-level contributor covers all four routes. Per-method
    // registration would let exactly one slip through unnoticed.
    expect((await request(expressApp).get('/api/v1/categories')).status).toBe(401)
    expect((await request(expressApp).post('/api/v1/categories').send({ name: 'X' })).status).toBe(401)
    expect((await request(expressApp).put('/api/v1/categories/x').send({ name: 'X' })).status).toBe(401)
    expect((await request(expressApp).delete('/api/v1/categories/x')).status).toBe(401)
  })
})
```

The paginated-envelope assertion may need adjusting once you see the real shape `ctx.paginate` produces — **run it, read the actual body, and assert against what it really is**. Do not weaken the assertion to make it pass; if the envelope has no `meta`, report the real shape.

- [ ] **Step 5: Run and verify**

```bash
pnpm --filter ./server exec vitest run src/modules/categories/__tests__/categories.controller.test.ts
pnpm run typecheck
pnpm run test
```

Expected: controller tests pass, 57 tests total.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add categories controller and module with module-level auth"
```

---

### Task 4: Cross-user isolation

Its own task and its own file because this is the security proof the whole ownership design exists for. If it lives among CRUD tests it gets skimmed.

**Files:**
- Create: `server/src/modules/categories/__tests__/isolation.test.ts`

- [ ] **Step 1: Write the isolation tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { Container } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { SqliteAdapter } from '../../../adapters/sqlite.adapter'
import { AuthModule } from '../../auth/auth.module'
import { CategoriesModule } from '../categories.module'

beforeEach(() => {
  Container.reset()
})

/** Two users on one app instance — the only setup that can prove isolation. */
async function twoUsers() {
  const { expressApp } = await createTestApp({
    modules: [AuthModule(), CategoriesModule()],
    adapters: [SqliteAdapter()],
  })

  async function signup(email: string) {
    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'hunter2hunter2', name: email })
    return res.body.token as string
  }

  return { expressApp, alice: await signup('alice@example.com'), bob: await signup('bob@example.com') }
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

describe('cross-user isolation', () => {
  it('Bob cannot see Alice’s categories in his list', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    await request(expressApp).post('/api/v1/categories').set(auth(alice)).send({ name: 'Alice Work' })

    const res = await request(expressApp).get('/api/v1/categories').set(auth(bob))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
    expect(JSON.stringify(res.body)).not.toContain('Alice Work')
  })

  it('Bob cannot update Alice’s category, and it is unchanged', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const created = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(alice))
      .send({ name: 'Alice Work' })

    const attempt = await request(expressApp)
      .put(`/api/v1/categories/${created.body.id}`)
      .set(auth(bob))
      .send({ name: 'Hijacked' })

    // 404, not 403 — a 403 would confirm the id exists.
    expect(attempt.status).toBe(404)

    const stillHers = await request(expressApp).get('/api/v1/categories').set(auth(alice))
    expect(stillHers.body.data[0].name).toBe('Alice Work')
  })

  it('Bob cannot delete Alice’s category, and it survives', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const created = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(alice))
      .send({ name: 'Alice Work' })

    expect(
      (await request(expressApp).delete(`/api/v1/categories/${created.body.id}`).set(auth(bob)))
        .status,
    ).toBe(404)

    const stillHers = await request(expressApp).get('/api/v1/categories').set(auth(alice))
    expect(stillHers.body.data).toHaveLength(1)
  })

  it('both users may hold a category with the same name', async () => {
    const { expressApp, alice, bob } = await twoUsers()

    const hers = await request(expressApp).post('/api/v1/categories').set(auth(alice)).send({ name: 'Work' })
    const his = await request(expressApp).post('/api/v1/categories').set(auth(bob)).send({ name: 'Work' })

    expect(hers.status).toBe(201)
    // 409 here would mean the unique constraint is global, making category
    // names a shared namespace and leaking that Alice already used one.
    expect(his.status).toBe(201)
    expect(his.body.id).not.toBe(hers.body.id)
  })

  it('a 404 for someone else’s id is indistinguishable from a 404 for a missing id', async () => {
    const { expressApp, alice, bob } = await twoUsers()
    const created = await request(expressApp)
      .post('/api/v1/categories')
      .set(auth(alice))
      .send({ name: 'Alice Work' })

    const othersId = await request(expressApp)
      .put(`/api/v1/categories/${created.body.id}`)
      .set(auth(bob))
      .send({ name: 'X' })

    const missingId = await request(expressApp)
      .put('/api/v1/categories/definitely-not-a-real-id')
      .set(auth(bob))
      .send({ name: 'X' })

    expect(othersId.status).toBe(missingId.status)
    // Identical bodies too — any difference is an existence oracle.
    expect(othersId.body).toEqual(missingId.body)
  })
})
```

The last case is the subtle one. Matching status codes are not enough: if the response bodies differ at all, an attacker can still distinguish "exists but not yours" from "does not exist".

- [ ] **Step 2: Run and verify**

```bash
pnpm --filter ./server exec vitest run src/modules/categories/__tests__/isolation.test.ts
pnpm run typecheck
pnpm run test
```

Expected: 5 isolation tests pass, 62 tests total.

- [ ] **Step 3: Confirm the tests would fail if ownership were removed**

A passing isolation suite is only meaningful if it fails when the control is gone. Temporarily break one scope check and confirm:

```bash
cd /home/forinda/Desktop/adero-api
cp server/src/modules/categories/categories.repository.ts /tmp/repo.bak
# Remove the owner predicate from listPaginated's scope, by hand, then:
pnpm --filter ./server exec vitest run src/modules/categories/__tests__/isolation.test.ts
cp /tmp/repo.bak server/src/modules/categories/categories.repository.ts
rm /tmp/repo.bak
```

Expected: the "Bob cannot see Alice's categories" case **fails** while the control is removed, and passes again once restored. Quote both outcomes in your report. If it still passes with the predicate gone, the test is not testing what it claims and must be fixed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: prove cross-user isolation for categories"
```

---

## Done when

- [ ] `pnpm run typecheck` passes; `pnpm run test` passes, pristine.
- [ ] All four category routes 401 without a token, proving module-level registration covers them.
- [ ] Bob cannot read, update, or delete Alice's category; update and delete return 404 with bodies identical to a genuinely-missing id.
- [ ] Two users can each hold a category named "Work".
- [ ] A duplicate name for the same user returns 409, produced by the database constraint rather than a racy pre-check.
- [ ] The list endpoint returns a paginated envelope and respects `limit`.
- [ ] No response contains `ownerId`.
- [ ] Removing an ownership predicate makes the isolation suite fail — verified, not assumed.

## Deliberately not in this story

- No `GET /categories/:id` — the design's API surface does not include it, and the list covers refetching.
- No `GET /categories/:id/tasks` — that is Story 6, and needs tasks to exist.
- No filtering on the list, only sort and search. Filters land in Story 5 where they matter.
- No bulk operations, no reordering.

## Carried forward

- **`AuthService.signup` pre-checks with a `SELECT` before inserting**, which is racy — two concurrent signups can both pass the check, and the constraint then surfaces as a 500 rather than a 409. `CategoriesService` uses the race-free catch-the-constraint form. Worth aligning signup to match.
- Login still has no rate limit.
- Story 5 will need Drizzle `relations()` for `/tasks/grouped`.
