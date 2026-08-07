import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { Autowired, Repository, type ParsedQuery } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { categories, type Category } from '@/db/schema'

/**
 * A search term is LITERAL — `%` and `_` match themselves. Same rule and same
 * reasoning as the tasks repository; kept local rather than shared because it
 * is three lines and a shared helper would couple two repositories together.
 * Drizzle's `like()` emits no ESCAPE clause, hence the raw sql. SQLite string
 * literals have no backslash escape, so `'\'` is a one-character string.
 */
function likeContains(column: SQLiteColumn, term: string): SQL {
  const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  return sql`${column} like ${pattern} escape '\\'`
}

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
    // The owner predicate is part of the scope, not an extra filter layered on
    // — search narrows within it and can never widen past it.
    const scope = parsed.search
      ? and(eq(categories.ownerId, ownerId), likeContains(categories.name, parsed.search))
      : eq(categories.ownerId, ownerId)

    // `Object.hasOwn`, not `in`: `in` walks the prototype chain, so
    // `constructor` and `toString` are "in" every object. Unknown fields fall
    // back to the default ordering.
    const [sort] = parsed.sort
    const column =
      sort && Object.hasOwn(SORTABLE, sort.field)
        ? SORTABLE[sort.field as keyof typeof SORTABLE]
        : categories.createdAt
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
    // Ownership is in the WHERE rather than a read-then-write check, so there
    // is no window between verifying and mutating.
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
