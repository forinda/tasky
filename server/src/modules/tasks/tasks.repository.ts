import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { Autowired, Repository, type FilterItem, type ParsedQuery } from '@forinda/kickjs'
import { Database } from '@/db/database'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  categories,
  taskCategories,
  tasks,
  type Category,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@/db/schema'

export interface CreateTaskInput {
  title: string
  description?: string | null
  priority?: TaskPriority
  status?: TaskStatus
}

export interface UpdateTaskPatch {
  title?: string
  description?: string | null
  priority?: TaskPriority
  status?: TaskStatus
}

/**
 * `priority` and `status` are text columns, so a plain ORDER BY sorts
 * alphabetically — high, low, medium — which looks plausible and is wrong.
 * These map each value to its semantic rank instead.
 */
const PRIORITY_RANK = sql`CASE ${tasks.priority} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`
const STATUS_RANK = sql`CASE ${tasks.status} WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END`

const SORTABLE = {
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  title: tasks.title,
  priority: PRIORITY_RANK,
  status: STATUS_RANK,
} as const

/**
 * A search term is LITERAL: `%` and `_` typed by a user match themselves, not
 * "anything". Users write `_` in ordinary words and `?q=_nrelated` matching
 * "unrelated" is a surprise, not a feature. The wildcards (and the escape
 * character itself, which must go first) are escaped and the LIKE is told to
 * honour `\` — Drizzle's `like()` emits no ESCAPE clause, hence the raw sql.
 *
 * SQLite string literals have no backslash escape, so `'\'` below is a plain
 * one-character string, not an unterminated literal.
 */
function likeContains(column: SQLiteColumn, term: string): SQL {
  const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  return sql`${column} like ${pattern} escape '\\'`
}

/**
 * Allow-list switch, never a lookup that forwards an arbitrary field name into
 * SQL. Returns undefined for an unrecognised field or an out-of-enum value —
 * the service rejects those with 422 first, so this is defence in depth.
 */
function filterCondition(filter: FilterItem): SQL | undefined {
  switch (filter.field) {
    case 'status':
      return TASK_STATUSES.includes(filter.value as TaskStatus)
        ? eq(tasks.status, filter.value as TaskStatus)
        : // Deliberately impossible rather than absent: a dropped predicate
          // would return the unfiltered set, which is the dangerous direction.
          sql`1 = 0`
    case 'priority':
      return TASK_PRIORITIES.includes(filter.value as TaskPriority)
        ? eq(tasks.priority, filter.value as TaskPriority)
        : sql`1 = 0`
    default:
      return undefined
  }
}

/** The only place in the app that touches the `tasks` table. */
@Repository()
export class TasksRepository {
  constructor(@Autowired() private readonly database: Database) {}

  /**
   * Owner predicate is the BASE of the and(...), never appended after — so no
   * combination of filters or search can produce a query without it.
   */
  private scope(ownerId: string, parsed: ParsedQuery): SQL | undefined {
    const conditions: (SQL | undefined)[] = [eq(tasks.ownerId, ownerId)]

    for (const filter of parsed.filters) conditions.push(filterCondition(filter))

    if (parsed.search) {
      conditions.push(
        or(likeContains(tasks.title, parsed.search), likeContains(tasks.description, parsed.search)),
      )
    }

    return and(...conditions.filter((c): c is SQL => c !== undefined))
  }

  /**
   * `Object.hasOwn`, not `in`: `in` walks the prototype chain, so `constructor`
   * and `toString` are "in" every object and would resolve to a function rather
   * than a column. Unknown fields fall back to the default ordering.
   */
  private ordering(parsed: ParsedQuery): SQL {
    const [sort] = parsed.sort
    const column =
      sort && Object.hasOwn(SORTABLE, sort.field)
        ? SORTABLE[sort.field as keyof typeof SORTABLE]
        : tasks.createdAt
    return (sort?.direction === 'desc' ? desc : asc)(column)
  }

  async listPaginated(
    ownerId: string,
    parsed: ParsedQuery,
  ): Promise<{ data: Task[]; total: number }> {
    const where = this.scope(ownerId, parsed)

    const data = this.database.db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(this.ordering(parsed))
      .limit(parsed.pagination.limit)
      .offset(parsed.pagination.offset)
      .all()

    const [{ value: total }] = this.database.db
      .select({ value: count() })
      .from(tasks)
      .where(where)
      .all()

    return { data, total }
  }

  /**
   * Raw material for the board view, deliberately NOT assembled here: the flat
   * rows carry each task's category links, so the service can build the buckets
   * AND each task's `categoryIds` in one pass instead of re-querying links per
   * task. Assembling here would return `Task[]` per column and force that N+1
   * back on the caller.
   *
   * Returns:
   *   rows       — one per (task, category link); a task with no links appears
   *                once with `categoryId: null` (LEFT JOIN). Oldest-first, with
   *                `id` as a tiebreak: several rows can share a millisecond and
   *                `cap` would otherwise truncate a different set each call.
   *   categories — every category this owner has, by name, including ones with
   *                no tasks: a board column that vanishes when emptied is a
   *                broken board. By name rather than `createdAt` for the same
   *                reason — `unique(ownerId, name)` makes it a total order,
   *                while a batch created in one millisecond does not. The owner
   *                predicate is repeated here on purpose: a category belongs to
   *                a user independently of any task, so the join to `tasks`
   *                does not scope it.
   *
   * `cap` bounds JOINED ROWS, not distinct tasks: a task in three categories
   * consumes three of the cap. That is the honest reading of a LIMIT on this
   * query, and the alternative (cap distinct tasks) needs a subquery to stay
   * correct — not worth it until a board actually hits the cap.
   */
  listGrouped(
    ownerId: string,
    cap: number,
  ): { rows: { task: Task; categoryId: string | null }[]; categories: Category[] } {
    const rows = this.database.db
      .select({ task: tasks, categoryId: taskCategories.categoryId })
      .from(tasks)
      .leftJoin(taskCategories, eq(taskCategories.taskId, tasks.id))
      .where(eq(tasks.ownerId, ownerId))
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .limit(cap)
      .all()

    const ownedCategories = this.database.db
      .select()
      .from(categories)
      .where(eq(categories.ownerId, ownerId))
      .orderBy(asc(categories.name))
      .all()

    return { rows, categories: ownedCategories }
  }

  /**
   * Tasks linked to one category. Scoped by BOTH `tasks.ownerId` and the join —
   * the category's ownership is checked by the caller, but relying on that to
   * imply the task's ownership makes this method unsafe the day someone calls
   * it with an unchecked id.
   */
  async listByCategory(
    ownerId: string,
    categoryId: string,
    parsed: ParsedQuery,
  ): Promise<{ data: Task[]; total: number }> {
    const where = and(this.scope(ownerId, parsed), eq(taskCategories.categoryId, categoryId))

    const data = this.database.db
      .select({ task: tasks })
      .from(tasks)
      .innerJoin(taskCategories, eq(taskCategories.taskId, tasks.id))
      .where(where)
      .orderBy(this.ordering(parsed))
      .limit(parsed.pagination.limit)
      .offset(parsed.pagination.offset)
      .all()
      .map((row) => row.task)

    // No DISTINCT needed: (taskId, categoryId) is the join table's primary key,
    // so a single categoryId matches each task at most once.
    const [{ value: total }] = this.database.db
      .select({ value: count() })
      .from(tasks)
      .innerJoin(taskCategories, eq(taskCategories.taskId, tasks.id))
      .where(where)
      .all()

    return { data, total }
  }

  async findById(id: string, ownerId: string): Promise<Task | null> {
    const [row] = this.database.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .all()
    return row ?? null
  }

  async create(ownerId: string, input: CreateTaskInput): Promise<Task> {
    const [row] = this.database.db
      .insert(tasks)
      .values({ ...input, description: input.description ?? null, ownerId })
      .returning()
      .all()
    return row
  }

  async update(id: string, ownerId: string, patch: UpdateTaskPatch): Promise<Task | null> {
    const [row] = this.database.db
      .update(tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .returning()
      .all()
    return row ?? null
  }

  /**
   * Which of `ids` this owner actually holds. An id belonging to someone else
   * and an id that does not exist are both simply absent from the result —
   * indistinguishable, so the 422 the service raises cannot be used to probe
   * for other users' category ids.
   *
   * Synchronous: callers use it before opening a transaction.
   */
  ownedCategoryIds(ownerId: string, ids: string[]): string[] {
    if (ids.length === 0) return []

    return this.database.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.ownerId, ownerId), inArray(categories.id, ids)))
      .all()
      .map((row) => row.id)
  }

  /** Synchronous — used inside and outside transactions. */
  findCategoryIds(taskId: string): string[] {
    return this.database.db
      .select({ id: taskCategories.categoryId })
      .from(taskCategories)
      .where(eq(taskCategories.taskId, taskId))
      .all()
      .map((row) => row.id)
  }

  /**
   * SYNCHRONOUS BY NECESSITY. better-sqlite3's `transaction()` is declared
   * `(fn: (tx) => T) => T` — it does not await. An async callback would return
   * a promise the driver never waits on, so the statements would land outside
   * the transaction and a failure part-way would leave the task row written
   * with no links. Do every async thing before calling this.
   */
  createWithCategories(ownerId: string, input: CreateTaskInput, categoryIds: string[]): Task {
    return this.database.db.transaction((tx) => {
      const [task] = tx
        .insert(tasks)
        .values({ ...input, description: input.description ?? null, ownerId })
        .returning()
        .all()

      if (categoryIds.length > 0) {
        tx.insert(taskCategories)
          .values(categoryIds.map((categoryId) => ({ taskId: task.id, categoryId })))
          .run()
      }

      return task
    })
  }

  /** Replaces the set wholesale. Synchronous, for the same reason as above. */
  replaceCategories(taskId: string, ownerId: string, categoryIds: string[]): boolean {
    return this.database.db.transaction((tx) => {
      // Ownership checked INSIDE the transaction, so a concurrent delete
      // cannot slip between the check and the write.
      const [owned] = tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.ownerId, ownerId)))
        .all()

      if (!owned) return false

      tx.delete(taskCategories).where(eq(taskCategories.taskId, taskId)).run()

      if (categoryIds.length > 0) {
        tx.insert(taskCategories)
          .values(categoryIds.map((categoryId) => ({ taskId, categoryId })))
          .run()
      }

      return true
    })
  }

  /**
   * The column patch and the link replacement in ONE transaction. Calling
   * `update` then `replaceCategories` runs two, so a failure in the link step
   * leaves the patch committed and the client sees a half-applied write.
   *
   * `categoryIds === undefined` means "leave the links alone"; `[]` means
   * "remove them all". Returns null when the task does not exist or is not this
   * owner's — the two are indistinguishable on purpose.
   *
   * Synchronous, like every transaction here: better-sqlite3 does not await.
   */
  updateWithCategories(
    id: string,
    ownerId: string,
    patch: UpdateTaskPatch,
    categoryIds: string[] | undefined,
  ): Task | null {
    return this.database.db.transaction((tx) => {
      const [row] = tx
        .update(tasks)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
        .returning()
        .all()

      if (!row) return null
      if (!categoryIds) return row

      tx.delete(taskCategories).where(eq(taskCategories.taskId, id)).run()

      if (categoryIds.length > 0) {
        tx.insert(taskCategories)
          .values(categoryIds.map((categoryId) => ({ taskId: id, categoryId })))
          .run()
      }

      return row
    })
  }

  async remove(id: string, ownerId: string): Promise<boolean> {
    const rows = this.database.db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .returning()
      .all()
    return rows.length > 0
  }
}
