# Story 3 — Auth Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email/password signup and login issuing a JWT, plus a `CurrentUser` context contributor that every later module's routes depend on for ownership scoping.

**Architecture:** Passwords hashed with `node:crypto` scrypt. Tokens signed HS256 via `jose`. `UsersRepository` and `AuthService` are concrete `@Repository()` / `@Service()` classes injected by type. Authentication is a single `defineHttpContextDecorator` that both verifies and provides — it throws `unauthorized` on failure and returns the user on success, so no separate guard exists.

**Tech Stack:** KickJS v6 (Express), Drizzle + better-sqlite3, `jose` 6, `node:crypto` scrypt, Zod, Vitest, supertest.

## Global Constraints

- Package manager is **pnpm**. Never `npm` or `yarn`.
- All commands from `/home/forinda/Desktop/adero-api`. **Run `pwd` before any location-dependent command** — a `cd server && …` persists and has caused wrong-directory incidents twice in this project.
- **`@Value` is `PropertyDecorator` only.** `constructor(@Value('JWT_SECRET') s: string)` fails with `TS1239`, and a defaulted parameter does not help (the container computes `paramCount = max(paramTypes.length, maxInjectIndex)` and tries to resolve `String`). Use `@Inject(ConfigService)` + `config.get('KEY')`, or `getEnv('KEY')` at module scope.
- Every new env key goes in the Zod schema at `server/src/config/index.ts` **and** all three of `.env`, `.env.example`, `.env.test`. The schema is re-validated on every env reload.
- `NODE_ENV` has no default. Do not add one.
- Repositories take `ownerId` as a **required parameter**, never optional. This story creates no owned rows, but it establishes the pattern Stories 4-5 follow.
- `passwordHash` must never appear in any response. Build auth payloads from an explicit field list — never spread a user row.
- Module entry files are `<name>.module.ts`. `defineModule()` factory only.
- `.kickjs/`, `dist/`, `data/`, `*.db*` are gitignored.

## Story 2 context you need

- `server/src/db/schema/` holds one file per table plus `enums.ts`, `timestamps.ts`, barrel `index.ts`. `users` has `id`, `email` (unique), `passwordHash`, `name`, `createdAt`, `updatedAt`.
- `Database` is `@Service()` with `readonly db` (Drizzle), `readonly connection`, and `close()`. Its constructor takes `@Inject(ConfigService)`.
- `SqliteAdapter` migrates in `beforeStart` and is mounted unconditionally from `server/src/adapters/index.ts`.
- `server/src/test-setup.ts` registers the env schema for every test via `setupFiles` — no per-file config import needed.
- Suite is at 11 tests across three files.

### Two traps recorded from Story 2 — read before writing a controller test

**`createTestApp({ isolated: true })` hands back a different container than adapters run against.** `createTestApp` builds `Container.create()`, but `Application`'s constructor takes `Container.getInstance()`. Adapters' `beforeStart` and the route table use the **global** container; the isolated one is a parallel graph. So seeding via `container.resolve(Database)` writes to a database the routes never see. **Do not pass `isolated: true` when passing adapters.** Resolve `Database` off `app.getContainer()` instead.

**A migration failure under test is completely silent.** The framework catches every `beforeStart` throw, and `.env.test` sets `LOG_LEVEL=silent`. A broken migration surfaces only as `no such table: users`. If tests fail that way, check migrations before debugging auth code.

---

## File Structure

| Path | Responsibility |
|---|---|
| `server/src/modules/auth/password.ts` | scrypt hash + timing-safe verify. Pure functions, no DI. |
| `server/src/modules/auth/tokens.ts` | `@Service() class Tokens` — JWT sign/verify via `jose`. |
| `server/src/modules/auth/users.repository.ts` | `@Repository() class UsersRepository` — the only place that touches the `users` table. |
| `server/src/modules/auth/auth.service.ts` | `@Service() class AuthService` — signup/login orchestration. |
| `server/src/modules/auth/auth.controller.ts` | `@Controller()` — three routes. |
| `server/src/modules/auth/auth.module.ts` | `defineModule()` — mounts `/auth`, contributes nothing globally. |
| `server/src/modules/auth/dtos/signup.dto.ts`, `login.dto.ts` | Zod request schemas. |
| `server/src/contributors/current-user.contributor.ts` | Verifies Bearer token, loads user, throws 401. Registered per-module. |
| `server/src/modules/auth/__tests__/*.test.ts` | Unit tests for password, tokens, repository. |
| `server/src/modules/auth/__tests__/auth.controller.test.ts` | HTTP-level tests including the 401 matrix. |

---

### Task 1: Dependencies, env, and password hashing

**Files:**
- Modify: `server/package.json`, `server/src/config/index.ts`, `server/.env`, `server/.env.example`, `server/.env.test`
- Create: `server/src/modules/auth/password.ts`, `server/src/modules/auth/__tests__/password.test.ts`

**Interfaces:**
- Produces: `hashPassword(plain: string): Promise<string>` and `verifyPassword(plain: string, stored: string): Promise<boolean>`. Task 3 consumes both. `JWT_SECRET` and `JWT_EXPIRES_IN` env keys; Task 2 consumes them.

- [ ] **Step 1: Install `jose`**

```bash
cd /home/forinda/Desktop/adero-api
pnpm --filter ./server add jose
```

Hashing needs no dependency — it is `node:crypto`.

- [ ] **Step 2: Add the env keys**

In `server/src/config/index.ts`, add after `DATABASE_URL`:

```ts
    // No default — a signing secret with a fallback is a signing secret that
    // ships to production. Boot must fail loudly when it is absent.
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('7d'),
```

- [ ] **Step 3: Add the keys to all three env files**

`server/.env` and `server/.env.test` — a development-only value, at least 32 chars:
```
JWT_SECRET=dev-only-insecure-secret-change-me-32chars
JWT_EXPIRES_IN=7d
```

`server/.env.example` — a placeholder plus a warning comment:
```
# Generate with: openssl rand -base64 48
# MUST be at least 32 characters. Never reuse the development value.
JWT_SECRET=replace-me-with-a-real-secret-at-least-32-chars
JWT_EXPIRES_IN=7d
```

`.env.example` is committed, so the value there must obviously be a placeholder, never a real secret.

- [ ] **Step 4: Write the failing test**

Create `server/src/modules/auth/__tests__/password.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../password'

describe('password hashing', () => {
  it('produces a verifiable hash', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('Correct horse battery staple', stored)).toBe(false)
  })

  it('never stores the plaintext', async () => {
    const stored = await hashPassword('hunter2')
    expect(stored).not.toContain('hunter2')
  })

  it('salts — the same password hashes differently every time', async () => {
    const a = await hashPassword('same')
    const b = await hashPassword('same')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same', a)).toBe(true)
    expect(await verifyPassword('same', b)).toBe(true)
  })

  it('returns false rather than throwing on a malformed stored value', async () => {
    expect(await verifyPassword('x', 'not-a-real-hash')).toBe(false)
    expect(await verifyPassword('x', '')).toBe(false)
    expect(await verifyPassword('x', 'scrypt$zzz$zzz')).toBe(false)
  })
})
```

The salt case is the one that matters most: identical passwords producing identical hashes would mean the salt is not being applied, which is invisible in a round-trip test.

- [ ] **Step 5: Run the test to verify it fails**

```bash
cd /home/forinda/Desktop/adero-api
pnpm --filter ./server exec vitest run src/modules/auth/__tests__/password.test.ts
```

Expected: FAIL — cannot resolve `../password`.

- [ ] **Step 6: Write the implementation**

Create `server/src/modules/auth/password.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64
const SALT_LENGTH = 32
const PREFIX = 'scrypt'

/**
 * Format: `scrypt$<salt-hex>$<hash-hex>`.
 *
 * The salt is stored alongside the hash because it must be recoverable to
 * verify, and it is not secret — its job is to make identical passwords hash
 * differently so one cracked hash does not crack every reuse of that password.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scryptAsync(plain, salt, KEY_LENGTH)
  return `${PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [prefix, saltHex, hashHex] = stored.split('$')
  if (prefix !== PREFIX || !saltHex || !hashHex) return false

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(saltHex, 'hex')
    expected = Buffer.from(hashHex, 'hex')
  } catch {
    return false
  }
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false

  const derived = await scryptAsync(plain, salt, KEY_LENGTH)
  // timingSafeEqual, not ===, so comparison time does not leak how many bytes
  // matched. It throws on length mismatch, which the guard above prevents.
  return timingSafeEqual(derived, expected)
}
```

A malformed stored value returns `false` rather than throwing — a corrupt row should fail the login, not crash the request.

- [ ] **Step 7: Run the test to verify it passes**

```bash
pnpm --filter ./server exec vitest run src/modules/auth/__tests__/password.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 8: Verify the suite and typecheck**

```bash
pnpm run typecheck
pnpm run test
```

Expected: both pass, 16 tests total.

- [ ] **Step 9: Confirm no secret leaked into a committed file**

```bash
git status --short
grep -n JWT_SECRET server/.env.example
```

`server/.env` is gitignored; `.env.example` and `.env.test` are committed. Confirm `.env.example` holds only the placeholder.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add scrypt password hashing and JWT env keys"
```

---

### Task 2: JWT signing and verification

**Files:**
- Create: `server/src/modules/auth/tokens.ts`, `server/src/modules/auth/__tests__/tokens.test.ts`

**Interfaces:**
- Consumes: `JWT_SECRET`, `JWT_EXPIRES_IN` from Task 1; `ConfigService` from `@forinda/kickjs`.
- Produces: `@Service() class Tokens` with `sign(userId: string): Promise<string>` and `verify(token: string): Promise<string | null>` returning the subject or `null`. Tasks 3 and 4 consume it.

- [ ] **Step 1: Write the failing test**

Create `server/src/modules/auth/__tests__/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { SignJWT } from 'jose'
import { Tokens } from '../tokens'

function makeTokens(): Tokens {
  return new Tokens(new ConfigService())
}

describe('Tokens', () => {
  it('round-trips a subject', async () => {
    const tokens = makeTokens()
    const token = await tokens.sign('user-1')
    expect(await tokens.verify(token)).toBe('user-1')
  })

  it('rejects a token signed with a different secret', async () => {
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode('a-completely-different-secret-32-chars'))

    expect(await makeTokens().verify(foreign)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const tokens = makeTokens()
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(new ConfigService().get('JWT_SECRET')))

    expect(await tokens.verify(expired)).toBeNull()
  })

  it('rejects garbage without throwing', async () => {
    const tokens = makeTokens()
    expect(await tokens.verify('not.a.jwt')).toBeNull()
    expect(await tokens.verify('')).toBeNull()
  })
})
```

The wrong-secret and expiry cases are the load-bearing ones — a `verify` that decoded without checking the signature would pass a naive round-trip test.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./server exec vitest run src/modules/auth/__tests__/tokens.test.ts
```

Expected: FAIL — cannot resolve `../tokens`.

- [ ] **Step 3: Write the implementation**

Create `server/src/modules/auth/tokens.ts`:

```ts
import { ConfigService, Inject, Service } from '@forinda/kickjs'
import { SignJWT, jwtVerify } from 'jose'

const ALG = 'HS256'

@Service()
export class Tokens {
  private readonly secret: Uint8Array
  private readonly expiresIn: string

  // `@Value` cannot annotate a constructor parameter in this version, so the
  // env comes through ConfigService — which also keeps the class directly
  // constructible in tests via `new Tokens(new ConfigService())`.
  constructor(@Inject(ConfigService) config: ConfigService) {
    this.secret = new TextEncoder().encode(config.get('JWT_SECRET'))
    this.expiresIn = config.get('JWT_EXPIRES_IN')
  }

  async sign(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: ALG })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(this.expiresIn)
      .sign(this.secret)
  }

  /** Returns the subject, or null for any invalid token. Never throws. */
  async verify(token: string): Promise<string | null> {
    try {
      // Pinning algorithms rejects a token whose header claims `none` or an
      // asymmetric alg — the classic JWT confusion attack.
      const { payload } = await jwtVerify(token, this.secret, { algorithms: [ALG] })
      return typeof payload.sub === 'string' ? payload.sub : null
    } catch {
      return null
    }
  }
}
```

`algorithms: [ALG]` is not optional. Without it, a token whose header says `alg: none` can be accepted by some verifiers.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter ./server exec vitest run src/modules/auth/__tests__/tokens.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Verify the suite and typecheck**

```bash
pnpm run typecheck
pnpm run test
```

Expected: both pass, 20 tests total.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add JWT signing and verification"
```

---

### Task 3: Users repository, auth service, and the signup/login routes

**Files:**
- Create: `server/src/modules/auth/users.repository.ts`, `auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, `dtos/signup.dto.ts`, `dtos/login.dto.ts`, `__tests__/users.repository.test.ts`, `__tests__/auth.controller.test.ts`
- Modify: `server/src/modules/index.ts`

**Interfaces:**
- Consumes: `Database` (Story 2), `hashPassword`/`verifyPassword` (Task 1), `Tokens` (Task 2).
- Produces: `UsersRepository` with `findByEmail(email: string)`, `findById(id: string)`, `create(input: { email: string; passwordHash: string; name: string })`. `AuthService` with `signup(dto)` and `login(dto)` both returning `{ user: PublicUser; token: string }`. `PublicUser` — the response shape with no `passwordHash`. Task 4 consumes `UsersRepository` and `PublicUser`.

- [ ] **Step 1: Write the DTOs**

`server/src/modules/auth/dtos/signup.dto.ts`:

```ts
import { z } from 'zod'

export const signupSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(200),
})

export type SignupDTO = z.infer<typeof signupSchema>
```

`server/src/modules/auth/dtos/login.dto.ts`:

```ts
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
})

export type LoginDTO = z.infer<typeof loginSchema>
```

Login's password has no `min(8)` — an existing user whose password predates a policy change must still be able to log in, and the value is checked against the hash regardless.

- [ ] **Step 2: Write the repository test**

Create `server/src/modules/auth/__tests__/users.repository.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { ConfigService } from '@forinda/kickjs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { Database } from '../../../db/database'
import { UsersRepository } from '../users.repository'

const MIGRATIONS = resolve(import.meta.dirname, '../../../db/migrations')

let open: Database | undefined

afterEach(() => {
  open?.close()
  open = undefined
})

function freshRepo(): UsersRepository {
  const database = new Database(new ConfigService())
  open = database
  migrate(database.db, { migrationsFolder: MIGRATIONS })
  return new UsersRepository(database)
}

describe('UsersRepository', () => {
  it('creates and finds a user by email', async () => {
    const repo = freshRepo()
    const created = await repo.create({ email: 'a@example.com', passwordHash: 'h', name: 'A' })

    expect(created.id).toBeTruthy()
    const found = await repo.findByEmail('a@example.com')
    expect(found?.id).toBe(created.id)
  })

  it('finds by id', async () => {
    const repo = freshRepo()
    const created = await repo.create({ email: 'b@example.com', passwordHash: 'h', name: 'B' })
    expect((await repo.findById(created.id))?.email).toBe('b@example.com')
  })

  it('returns null for a missing user rather than throwing', async () => {
    const repo = freshRepo()
    expect(await repo.findByEmail('nobody@example.com')).toBeNull()
    expect(await repo.findById('does-not-exist')).toBeNull()
  })

  it('rejects a duplicate email at the database level', async () => {
    const repo = freshRepo()
    await repo.create({ email: 'dupe@example.com', passwordHash: 'h', name: 'A' })
    await expect(
      repo.create({ email: 'dupe@example.com', passwordHash: 'h', name: 'B' }),
    ).rejects.toThrow(/UNIQUE/i)
  })
})
```

The duplicate case asserts the **database** rejects it, not just the service — a uniqueness check done only in application code loses a race between two concurrent signups.

- [ ] **Step 3: Run it to verify it fails**

```bash
pnpm --filter ./server exec vitest run src/modules/auth/__tests__/users.repository.test.ts
```

Expected: FAIL — cannot resolve `../users.repository`.

- [ ] **Step 4: Write the repository**

Create `server/src/modules/auth/users.repository.ts`:

```ts
import { eq } from 'drizzle-orm'
import { Autowired, Repository } from '@forinda/kickjs'
import { Database } from '../../db/database'
import { users, type User } from '../../db/schema'

export interface CreateUserInput {
  email: string
  passwordHash: string
  name: string
}

/** The only place in the app that touches the `users` table. */
@Repository()
export class UsersRepository {
  constructor(@Autowired() private readonly database: Database) {}

  async findByEmail(email: string): Promise<User | null> {
    const [row] = this.database.db.select().from(users).where(eq(users.email, email)).all()
    return row ?? null
  }

  async findById(id: string): Promise<User | null> {
    const [row] = this.database.db.select().from(users).where(eq(users.id, id)).all()
    return row ?? null
  }

  async create(input: CreateUserInput): Promise<User> {
    const [row] = this.database.db.insert(users).values(input).returning().all()
    return row
  }
}
```

If `@Autowired()` does not work as a constructor-parameter decorator here, use `@Inject(Database)` instead — `Inject` is declared `PropertyOrParameterDecorator`. Verify rather than assume; report BLOCKED if neither works.

- [ ] **Step 5: Run it to verify it passes**

```bash
pnpm --filter ./server exec vitest run src/modules/auth/__tests__/users.repository.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Write the service**

Create `server/src/modules/auth/auth.service.ts`:

```ts
import { Autowired, HttpException, Service } from '@forinda/kickjs'
import type { User } from '../../db/schema'
import { UsersRepository } from './users.repository'
import { Tokens } from './tokens'
import { hashPassword, verifyPassword } from './password'
import type { SignupDTO } from './dtos/signup.dto'
import type { LoginDTO } from './dtos/login.dto'

/** The user shape that leaves the API. Deliberately has no passwordHash. */
export interface PublicUser {
  id: string
  email: string
  name: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Built from an explicit field list, never by spreading the row — a spread
 * would carry passwordHash into every response the day someone adds a field.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

@Service()
export class AuthService {
  constructor(
    @Autowired() private readonly users: UsersRepository,
    @Autowired() private readonly tokens: Tokens,
  ) {}

  async signup(dto: SignupDTO): Promise<{ user: PublicUser; token: string }> {
    if (await this.users.findByEmail(dto.email)) {
      throw HttpException.conflict('Email already registered')
    }

    const user = await this.users.create({
      email: dto.email,
      passwordHash: await hashPassword(dto.password),
      name: dto.name,
    })

    return { user: toPublicUser(user), token: await this.tokens.sign(user.id) }
  }

  async login(dto: LoginDTO): Promise<{ user: PublicUser; token: string }> {
    const user = await this.users.findByEmail(dto.email)

    // Hash a dummy value when the user is missing so an unknown email and a
    // wrong password take comparable time. Without this the response time
    // discloses which emails are registered.
    const stored = user?.passwordHash ?? (await hashPassword('timing-equaliser'))
    const ok = await verifyPassword(dto.password, stored)

    // Identical message either way — a distinct "no such user" would hand out
    // a user-enumeration oracle.
    if (!user || !ok) throw HttpException.unauthorized('Invalid email or password')

    return { user: toPublicUser(user), token: await this.tokens.sign(user.id) }
  }
}
```

- [ ] **Step 7: Write the controller**

Create `server/src/modules/auth/auth.controller.ts`:

```ts
import { Autowired, Controller, Post, reply, type Ctx } from '@forinda/kickjs'
import { ApiTags } from '@forinda/kickjs-swagger'
import { AuthService } from './auth.service'
import { signupSchema } from './dtos/signup.dto'
import { loginSchema } from './dtos/login.dto'

@Controller()
export class AuthController {
  @Autowired() private readonly auth!: AuthService

  @Post('/signup', { body: signupSchema, name: 'Signup' })
  @ApiTags('Auth')
  async signup(ctx: Ctx) {
    return reply.created(await this.auth.signup(ctx.body))
  }

  @Post('/login', { body: loginSchema, name: 'Login' })
  @ApiTags('Auth')
  async login(ctx: Ctx) {
    return this.auth.login(ctx.body)
  }
}
```

`GET /auth/me` is added in Task 4, once the contributor exists.

- [ ] **Step 8: Write the module**

Create `server/src/modules/auth/auth.module.ts`:

```ts
import { defineModule } from '@forinda/kickjs'
import { AuthController } from './auth.controller'

// Eagerly load decorated classes so @Controller/@Service/@Repository register
// in the DI container. Recursive globs so nesting keeps working.
import.meta.glob(
  ['./**/*.controller.ts', './**/*.service.ts', './**/*.repository.ts', '!./**/*.test.ts'],
  { eager: true },
)

export const AuthModule = defineModule({
  name: 'AuthModule',
  build: () => ({
    routes() {
      return { path: '/auth', controller: AuthController }
    },
  }),
})
```

There is no `register()` hook — every dependency is a concrete class resolved by type. `tokens.ts` is not matched by the glob; import it where it is used and the `@Service()` decorator fires through that import chain. If DI cannot resolve `Tokens`, add `'./**/tokens.ts'` to the glob and say so in your report.

- [ ] **Step 9: Mount the module**

In `server/src/modules/index.ts`:

```ts
import { defineModules } from '@forinda/kickjs'
import { AuthModule } from './auth/auth.module'

export const modules = defineModules().mount(AuthModule())
```

- [ ] **Step 10: Write the controller test**

Create `server/src/modules/auth/__tests__/auth.controller.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { Container } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { SqliteAdapter } from '../../../adapters/sqlite.adapter'
import { AuthModule } from '../auth.module'

// NOTE: no `isolated: true`. createTestApp's isolated container is NOT the one
// adapters and routes use (Application takes Container.getInstance()), so an
// isolated graph would leave the routes reading a different, unmigrated database.
async function appFor() {
  Container.reset()
  return createTestApp({ modules: [AuthModule()], adapters: [SqliteAdapter()] })
}

describe('POST /api/v1/auth/signup', () => {
  beforeEach(() => {
    Container.reset()
  })

  it('creates a user and returns a token', async () => {
    const { expressApp } = await appFor()

    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@example.com', password: 'hunter2hunter2', name: 'A' })

    expect(res.status).toBe(201)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.email).toBe('a@example.com')
  })

  it('never returns passwordHash', async () => {
    const { expressApp } = await appFor()

    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@example.com', password: 'hunter2hunter2', name: 'B' })

    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
    expect(JSON.stringify(res.body)).not.toContain('scrypt$')
  })

  it('rejects a duplicate email with 409', async () => {
    const { expressApp } = await appFor()
    const body = { email: 'dupe@example.com', password: 'hunter2hunter2', name: 'A' }

    await request(expressApp).post('/api/v1/auth/signup').send(body)
    const res = await request(expressApp).post('/api/v1/auth/signup').send(body)

    expect(res.status).toBe(409)
  })

  it('rejects a short password with 400', async () => {
    const { expressApp } = await appFor()

    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email: 'c@example.com', password: 'short', name: 'C' })

    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => {
    Container.reset()
  })

  it('returns a token for correct credentials', async () => {
    const { expressApp } = await appFor()
    await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email: 'd@example.com', password: 'hunter2hunter2', name: 'D' })

    const res = await request(expressApp)
      .post('/api/v1/auth/login')
      .send({ email: 'd@example.com', password: 'hunter2hunter2' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
  })

  it('fails identically for a wrong password and an unknown email', async () => {
    const { expressApp } = await appFor()
    await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email: 'e@example.com', password: 'hunter2hunter2', name: 'E' })

    const wrongPassword = await request(expressApp)
      .post('/api/v1/auth/login')
      .send({ email: 'e@example.com', password: 'wrongwrongwrong' })

    const unknownEmail = await request(expressApp)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrongwrongwrong' })

    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    // Identical bodies — any difference is a user-enumeration oracle.
    expect(unknownEmail.body).toEqual(wrongPassword.body)
  })
})
```

The last case is the security-critical one. If the two responses differ in any field, an attacker can enumerate registered emails.

- [ ] **Step 11: Run it**

```bash
pnpm --filter ./server exec vitest run src/modules/auth/__tests__/auth.controller.test.ts
```

Expected: PASS, 6 tests.

If every case fails with `no such table: users`, migrations did not run — check that `SqliteAdapter()` is in the `adapters` array and that `isolated` is absent.

If the duplicate-email case returns 500 rather than 409, the database's UNIQUE constraint fired before the service's pre-check — decide deliberately whether to catch it in the service, and say what you chose.

- [ ] **Step 12: Verify suite and typecheck**

```bash
pnpm run typecheck
pnpm run test
```

Expected: both pass, 30 tests total.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: add users repository, auth service, and signup/login routes"
```

---

### Task 4: The `CurrentUser` contributor and `GET /auth/me`

**Files:**
- Create: `server/src/contributors/current-user.contributor.ts`
- Modify: `server/src/modules/auth/auth.controller.ts`, `server/src/modules/auth/auth.module.ts`, `server/src/modules/auth/__tests__/auth.controller.test.ts`

**Interfaces:**
- Consumes: `Tokens` and `UsersRepository` from Tasks 2-3.
- Produces: `CurrentUser` — a `ContextDecorator` with `.registration` for module-level use. Handlers read `ctx.require('currentUser')`. Stories 4-5 register it on their modules for ownership scoping.

- [ ] **Step 1: Write the contributor**

Create `server/src/contributors/current-user.contributor.ts`:

```ts
import { HttpException, defineHttpContextDecorator } from '@forinda/kickjs'
import { UsersRepository } from '../modules/auth/users.repository'
import { Tokens } from '../modules/auth/tokens'
import { toPublicUser, type PublicUser } from '../modules/auth/auth.service'

// Registers the key so `ctx.require('currentUser')` is typed.
declare module '@forinda/kickjs' {
  interface ContextMeta {
    currentUser: PublicUser
  }
}

/**
 * Authenticates AND provides. A contributor whose `resolve` throws forwards to
 * the request error handler (there is no `optional: true` here), so this single
 * piece replaces a separate guard — which is also what the project's deny-list
 * prescribes: a middleware whose only output is `ctx.set()` should be a
 * contributor instead.
 *
 * Register it at the module level on protected modules. It is deliberately NOT
 * global: signup and login must stay reachable without a token.
 */
export const CurrentUser = defineHttpContextDecorator({
  key: 'currentUser',
  deps: { tokens: Tokens, users: UsersRepository },
  resolve: async (ctx, { tokens, users }) => {
    const header = ctx.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      throw HttpException.unauthorized('Missing or malformed Authorization header')
    }

    const subject = await tokens.verify(header.slice('Bearer '.length))
    if (!subject) throw HttpException.unauthorized('Invalid or expired token')

    // A token can outlive its user. Treat a deleted account as unauthenticated
    // rather than letting a valid signature imply a valid user.
    const user = await users.findById(subject)
    if (!user) throw HttpException.unauthorized('Invalid or expired token')

    return toPublicUser(user)
  },
})
```

`deps` accepts constructors as well as tokens — `DepValue = InjectionToken<unknown> | Constructor<unknown>` — so the concrete classes work directly.

- [ ] **Step 2: Add `GET /auth/me`**

In `server/src/modules/auth/auth.controller.ts`, add the import and the route:

```ts
import { CurrentUser } from '../../contributors/current-user.contributor'

  @Get('/me')
  @ApiTags('Auth')
  @CurrentUser
  async me(ctx: Ctx) {
    return ctx.require('currentUser')
  }
```

Add `Get` to the `@forinda/kickjs` import. The contributor is applied per-method here rather than module-wide, because signup and login on the same controller must stay public.

If `@CurrentUser` as a bare decorator does not typecheck, the factory may require a call or `.with()` — inspect `ContextDecorator` and use the correct form. Report BLOCKED rather than guessing.

- [ ] **Step 3: Add the 401 matrix to the controller test**

Append to `server/src/modules/auth/__tests__/auth.controller.test.ts`:

```ts
import { SignJWT } from 'jose'

describe('GET /api/v1/auth/me', () => {
  beforeEach(() => {
    Container.reset()
  })

  async function signedUp() {
    const { expressApp } = await appFor()
    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email: 'me@example.com', password: 'hunter2hunter2', name: 'Me' })
    return { expressApp, token: res.body.token as string, user: res.body.user }
  }

  it('returns the current user for a valid token', async () => {
    const { expressApp, token, user } = await signedUp()

    const res = await request(expressApp)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(user.id)
    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
  })

  it('401s with no token', async () => {
    const { expressApp } = await signedUp()
    expect((await request(expressApp).get('/api/v1/auth/me')).status).toBe(401)
  })

  it('401s with a malformed header', async () => {
    const { expressApp, token } = await signedUp()
    const res = await request(expressApp).get('/api/v1/auth/me').set('Authorization', token)
    expect(res.status).toBe(401)
  })

  it('401s with a garbage token', async () => {
    const { expressApp } = await signedUp()
    const res = await request(expressApp)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.jwt')
    expect(res.status).toBe(401)
  })

  it('401s with a token signed by the wrong secret', async () => {
    const { expressApp, user } = await signedUp()
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode('a-completely-different-secret-32-chars'))

    const res = await request(expressApp)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${foreign}`)
    expect(res.status).toBe(401)
  })

  it('401s for a valid token whose user no longer exists', async () => {
    const { expressApp } = await appFor()
    const orphan = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-that-never-existed')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET as string))

    const res = await request(expressApp)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${orphan}`)
    expect(res.status).toBe(401)
  })

  it('signup and login remain reachable without a token', async () => {
    const { expressApp } = await appFor()
    const res = await request(expressApp)
      .post('/api/v1/auth/signup')
      .send({ email: 'public@example.com', password: 'hunter2hunter2', name: 'P' })
    expect(res.status).toBe(201)
  })
})
```

The last case is the one that catches over-application: registering the contributor module-wide instead of per-method would lock everyone out of signing up, and every other test would still pass.

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter ./server exec vitest run src/modules/auth/__tests__/auth.controller.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Verify suite and typecheck**

```bash
pnpm run typecheck
pnpm run test
```

Expected: both pass, 37 tests total.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add CurrentUser contributor and GET /auth/me"
```

---

### Task 5: Close the two error-surface items carried from Stories 1-2

Both were deferred because they were untestable with no routes mounted. Task 3 mounted routes, so they are testable now.

**Files:**
- Create: `server/src/http/not-found.ts`, `server/src/__tests__/error-surface.test.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Establish what the built-in handlers actually do**

Before changing anything, measure. Write `server/src/__tests__/error-surface.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { Container } from '@forinda/kickjs'
import { createTestApp } from '@forinda/kickjs-testing'
import { SqliteAdapter } from '../adapters/sqlite.adapter'
import { AuthModule } from '../modules/auth/auth.module'

describe('error surface', () => {
  it('emits RFC 9457 problem+json for an unmatched route', async () => {
    Container.reset()
    const { expressApp } = await createTestApp({
      modules: [AuthModule()],
      adapters: [SqliteAdapter()],
    })

    const res = await request(expressApp).get('/api/v1/no-such-route')

    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.body).toMatchObject({ status: 404 })
    expect(res.body.title).toBeTruthy()
  })
})
```

Run it. It **will fail** — the built-in returns `{"message":"Not Found"}` with `application/json`. Quote that failure in your report; it is the evidence for why the override is needed. The mismatch matters because the typed client parses `KickClientError.body` as problem details, so a handler-raised 404 and a routing 404 would carry different shapes.

- [ ] **Step 2: Write the handler**

Create `server/src/http/not-found.ts`:

```ts
import type { Request, Response } from 'express'

/**
 * The framework default returns `{"message":"Not Found"}` as application/json,
 * which diverges from every handler-raised error (those go through
 * `ctx.problem.*` / HttpException and emit RFC 9457). One status, two shapes,
 * and the typed client parses `KickClientError.body` as problem details — so
 * the routing 404 is the one it cannot read. This makes them agree.
 */
export function notFoundProblem(req: Request, res: Response): void {
  res.status(404)
  res.setHeader('Content-Type', 'application/problem+json')
  res.json({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: `No route matches ${req.method} ${req.originalUrl}`,
  })
}
```

- [ ] **Step 3: Wire it into bootstrap**

In `server/src/index.ts`, add the import and the option:

```ts
import { notFoundProblem } from './http/not-found'

export const app = await bootstrap({
  modules,
  runtime: expressRuntime(),
  adapters,
  onNotFound: notFoundProblem,
})
```

`onNotFound` is typed `(req: any, res: any, next: any) => void`. Note it takes raw Express arguments — engine coupling that is fine while `kick.config.ts` pins `runtime: 'express'`, but is the piece that breaks if the runtime ever changes.

`createTestApp` forwards `onNotFound` (it is in `BootstrapPassthroughOptions`), but the test above does not pass it. **Add `onNotFound: notFoundProblem` to the `createTestApp` call in the test**, or the test exercises the default and still fails. If `createTestApp` turns out not to forward it, report that — it would mean route-level 404 behavior cannot be tested at all, which is worth knowing.

- [ ] **Step 4: Run the test**

```bash
pnpm --filter ./server exec vitest run src/__tests__/error-surface.test.ts
```

Expected: PASS.

- [ ] **Step 5: Determine whether `onError` leaks stack traces in production**

This is the open question from Story 1 — untestable until a route could throw. Add a case that forces one. Append to the same test file:

```ts
  it('does not leak stack traces or internal paths in production', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      Container.reset()
      const { expressApp } = await createTestApp({
        modules: [AuthModule()],
        adapters: [SqliteAdapter()],
        onNotFound: notFoundProblem,
      })

      // A malformed body reaches the handler and throws inside the service.
      const res = await request(expressApp)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'x' })

      const body = JSON.stringify(res.body)
      expect(body).not.toMatch(/\/home\//)
      expect(body).not.toMatch(/node_modules/)
      expect(body).not.toMatch(/\bat \w+ \(/)
      expect(body).not.toContain('stack')
    } finally {
      process.env.NODE_ENV = previous
    }
  })
```

**Report the actual outcome, whatever it is.** If the default handler leaks, say so plainly and stop — do not add a custom `onError` without checking in, because that is a design decision about the whole error surface, not a local fix. If it does not leak, that closes the item and the plan's §16b note can be retired.

Note the `NODE_ENV` mutation here is deliberate and scoped to one case. If `getEnv` has already cached the env, flipping `process.env` may not affect the handler's view — if the test cannot actually reach production behavior, say so rather than reporting a false pass.

- [ ] **Step 6: Verify suite and typecheck**

```bash
pnpm run typecheck
pnpm run test
```

Expected: both pass. Total depends on Step 5's outcome; report the number.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix: emit RFC 9457 for unmatched routes and verify error redaction"
```

---

## Done when

- [ ] `pnpm run typecheck` passes; `pnpm run test` passes, pristine.
- [ ] `POST /api/v1/auth/signup` returns 201 with a token; a duplicate email returns 409; a short password returns **422** (the framework maps Zod failures to Unprocessable Entity, not 400).
- [ ] `POST /api/v1/auth/login` returns 200 with a token; a wrong password and an unknown email return **identical** 401 responses.
- [ ] `GET /api/v1/auth/me` returns 200 with a valid token and 401 for each of: no token, malformed header, garbage token, wrong-secret token, and a valid token whose user no longer exists.
- [ ] Signup and login remain reachable without a token.
- [ ] No response body anywhere contains `passwordHash` or `scrypt$`.
- [ ] An unmatched route returns `application/problem+json`.
- [ ] The `onError` stack-leak question is answered with evidence, either way. **Answered:** production redacts `error` and `stack`; non-production includes them deliberately. Both pinned by tests in `server/src/__tests__/error-surface.test.ts`.
- [ ] `JWT_SECRET` appears only in `.env.example` (now deliberately EMPTY, so `cp .env.example .env` fails `min(32)` rather than booting on a repo-published secret) and in `.env.test`, which carries a labelled dev-only value.

## Deliberately not in this story

- No refresh tokens, no logout, no token revocation. Logout is a client-side discard, per `plan.md` §6.
- No password reset, no email verification, no rate limiting on login. Rate limiting is worth adding before this is public; `rateLimit()` ships with the framework.
- No `tasks` or `categories` modules — Stories 4-5.
- No account deletion. Ownership FKs are `ON DELETE restrict`, so whenever it is added it must clear tasks and categories first, in a transaction.

## Carried forward

- **Story 5 needs `relations()`.** `server/src/db/schema/index.ts` declares none, so `db.query.tasks.findMany({ with: { categories: true } })` will not work for `/tasks/grouped`. Manual joins are the alternative.
- **Login has no rate limit.** scrypt makes each attempt costly, but nothing caps attempts per address.
