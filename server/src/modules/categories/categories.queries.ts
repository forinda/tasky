import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { type ParsedQuery } from '@forinda/kickjs'
import type { Database } from '@/db/database'
import { categories, type Category } from '@/db/schema'

/**
 * The drizzle handle, not the `Database` service. These are plain functions —
 * no class, no DI — so a caller passes what it already holds and a test can
 * call them with nothing but a migrated database.
 */
type Db = Database['db']

/**
 * THE owner predicate. Every statement below starts from this and it is always
 * the FIRST argument to `and(...)`, never appended after a filter. Appended it
 * reads the same but invites the later edit that tucks it behind a conditional;
 * as the base it cannot be dropped without deleting this call outright.
 */
export const ownedBy = (ownerId: string): SQL => eq(categories.ownerId, ownerId)

/**
 * One category, owner-scoped.
 *
 * `and()` is typed `SQL | undefined` because it returns `undefined` when every
 * argument is. Both are always defined here, and the assertion keeps the return
 * type non-optional — a `where(undefined)` is an UNSCOPED statement, so that is
 * not a value any caller should be able to receive.
 */
export const ownedCategory = (ownerId: string, id: string): SQL =>
  and(ownedBy(ownerId), eq(categories.id, id)) as SQL

/**
 * A search term is LITERAL — `%` and `_` match themselves. Drizzle's `like()`
 * emits no ESCAPE clause, hence the raw sql. SQLite string literals have no
 * backslash escape, so `'\'` is a one-character string.
 */
function likeContains(column: SQLiteColumn, term: string): SQL {
  const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  return sql`${column} like ${pattern} escape '\\'`
}

/**
 * The list scope: owner first, search narrowed WITHIN it. Search can never
 * widen past the owner because it is anded onto the base, not or-ed beside it.
 */
export const listScope = (ownerId: string, search: string): SQL =>
  search ? (and(ownedBy(ownerId), likeContains(categories.name, search)) as SQL) : ownedBy(ownerId)

const SORTABLE = {
  name: categories.name,
  createdAt: categories.createdAt,
  updatedAt: categories.updatedAt,
} as const

/**
 * `Object.hasOwn`, not `in`: `in` walks the prototype chain, so `constructor`
 * and `toString` are "in" every object and would resolve to a function rather
 * than a column. Unknown fields fall back to the default ordering.
 */
export function listOrdering(parsed: ParsedQuery): SQL {
  const [sort] = parsed.sort
  const column =
    sort && Object.hasOwn(SORTABLE, sort.field)
      ? SORTABLE[sort.field as keyof typeof SORTABLE]
      : categories.createdAt
  return (sort?.direction === 'desc' ? desc : asc)(column)
}

/**
 * SQLite surfaces a unique-index violation as SQLITE_CONSTRAINT_UNIQUE. Match on
 * the code where available and fall back to the message, since the driver wraps
 * errors differently depending on the call path.
 *
 * Shared by create and update: both write `name`, so both can collide, and the
 * unique index — not a preceding SELECT — is the authority in each. A
 * read-then-write check loses the race between two concurrent requests; the
 * database is the only party that cannot.
 */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT') return true
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

export interface CreateCategoryInput {
  name: string
  color?: string | null
}

export interface UpdateCategoryPatch {
  name?: string
  color?: string | null
}

/**
 * Everything below is the ONLY code in the app that touches the `categories`
 * table. It stayed together rather than being copied into the five use cases
 * because the owner predicate is the thing being protected: five inlined
 * `where` clauses are five chances to write the one that forgets, and no test
 * fails on the day it happens except by luck.
 *
 * `ownerId` is a required leading parameter on every one of them, not an
 * optional filter — the compiler is a cheaper guard than a reviewer.
 *
 * The `async` on synchronous better-sqlite3 calls mirrors the repository these
 * replaced; the callers already `await` and the driver may not stay sync.
 */
export async function listCategoriesPage(
  db: Db,
  ownerId: string,
  parsed: ParsedQuery,
): Promise<{ data: Category[]; total: number }> {
  const scope = listScope(ownerId, parsed.search)

  const data = db
    .select()
    .from(categories)
    .where(scope)
    .orderBy(listOrdering(parsed))
    .limit(parsed.pagination.limit)
    .offset(parsed.pagination.offset)
    .all()

  // Counted against the SAME scope, so `total` is the owner's total rather than
  // the page length — the client needs it to compute page count.
  const [{ value: total }] = db.select({ value: count() }).from(categories).where(scope).all()

  return { data, total }
}

export async function findCategory(db: Db, ownerId: string, id: string): Promise<Category | null> {
  const [row] = db.select().from(categories).where(ownedCategory(ownerId, id)).all()
  return row ?? null
}

export async function insertCategory(
  db: Db,
  ownerId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  const [row] = db
    .insert(categories)
    .values({ ownerId, name: input.name, color: input.color ?? null })
    .returning()
    .all()
  return row
}

/**
 * Ownership is in the WHERE rather than a read-then-write check, so there is no
 * window between verifying and mutating. `null` means no row matched — the
 * caller cannot tell whether the id was unknown or someone else's, and neither
 * can the client it answers.
 */
export async function updateCategory(
  db: Db,
  ownerId: string,
  id: string,
  patch: UpdateCategoryPatch,
): Promise<Category | null> {
  const [row] = db
    .update(categories)
    .set({ ...patch, updatedAt: new Date() })
    .where(ownedCategory(ownerId, id))
    .returning()
    .all()
  return row ?? null
}

/**
 * Only the `task_categories` join rows cascade — see the schema. The tasks
 * themselves survive a category deletion, which is what makes a category a
 * label rather than a folder.
 */
export async function deleteCategory(db: Db, ownerId: string, id: string): Promise<boolean> {
  return db.delete(categories).where(ownedCategory(ownerId, id)).returning().all().length > 0
}
