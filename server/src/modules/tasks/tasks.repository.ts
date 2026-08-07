import { and, asc, count, desc, eq, gt, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
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

/**
 * `move` cannot make do with `Task | null`: "no such task of yours" and "no such
 * anchor" are different answers (404 vs 422) and the service has to tell them
 * apart. A union beats an out-param or a throw from inside a transaction.
 */
export type MoveResult = Task | 'not-found' | 'unknown-anchor'

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
  position: tasks.position,
} as const

/**
 * The handle better-sqlite3 hands a transaction callback. Every read of
 * `position` that decides a write happens inside a transaction — otherwise the
 * min/neighbour lookup and the UPDATE that depends on it are two statements a
 * concurrent move can slip between — so the helpers below take this, not `db`.
 */
type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0]

/**
 * Below this, a midpoint is no longer worth taking and the bucket is renumbered
 * instead. Doubles carry ~15 significant digits, so halving a gap of 1 collides
 * outright after ~52 splits — the failure is silent and arrives only after long
 * use, which is why the threshold sits an order of magnitude of splits early:
 * 1e-9 fires around the 30th consecutive split between the same two neighbours.
 * No human reorders one pair 30 times, so the renumber is effectively never
 * seen, and when it is, it is cheap and correct.
 */
const MIN_GAP = 1e-9

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
    case 'categoryId':
      // EXISTS, not a join. tasks↔categories is many-to-many, so joining would
      // emit one row per matching link and a task in two categories would be
      // counted twice — corrupting `total` in the pagination envelope while the
      // page itself still looked right.
      //
      // No ownership check here, and none is needed: the surrounding query is
      // already scoped to the owner's tasks, so a foreign category id matches
      // nothing. That is also the desired answer — validating existence would
      // let a client probe for other users' category ids one error at a time.
      return sql`exists (
        select 1 from ${taskCategories}
        where ${taskCategories.taskId} = ${tasks.id}
          and ${taskCategories.categoryId} = ${filter.value}
      )`
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
    // A status filter IS a board column, and inside one column `position` is
    // the only order that means anything — that is the order the user dragged
    // the cards into. Across columns positions are not comparable (they are
    // assigned per status), so an unfiltered list keeps the createdAt default.
    const fallback = parsed.filters.some((f) => f.field === 'status')
      ? tasks.position
      : tasks.createdAt
    const column =
      sort && Object.hasOwn(SORTABLE, sort.field)
        ? SORTABLE[sort.field as keyof typeof SORTABLE]
        : fallback
    return (sort?.direction === 'desc' ? desc : asc)(column)
  }

  /**
   * The slot at the TOP of a column: `min - 1`. New work goes above what is
   * already there (matching the client's optimistic insert) and it costs one
   * read, not a renumber — the entire point of a fractional index.
   */
  private topPosition(tx: Tx, ownerId: string, status: TaskStatus): number {
    const [row] = tx
      .select({ value: sql<number | null>`min(${tasks.position})` })
      .from(tasks)
      .where(and(eq(tasks.ownerId, ownerId), eq(tasks.status, status)))
      .all()
    return (row?.value ?? 1) - 1
  }

  /**
   * The next position above `after` in the column, or null if nothing is above
   * it. The moving task is excluded — it is about to leave its current slot, so
   * counting it as its own neighbour would place it next to itself.
   */
  private positionAbove(
    tx: Tx,
    ownerId: string,
    status: TaskStatus,
    movingId: string,
    after: number,
  ): number | null {
    const [row] = tx
      .select({ value: sql<number | null>`min(${tasks.position})` })
      .from(tasks)
      .where(
        and(
          eq(tasks.ownerId, ownerId),
          eq(tasks.status, status),
          ne(tasks.id, movingId),
          gt(tasks.position, after),
        ),
      )
      .all()
    return row?.value ?? null
  }

  /**
   * Renumber one bucket to 1, 2, 3… — the part of a fractional index everyone
   * omits. Repeatedly splitting the same gap halves it each time; after ~52
   * splits the two neighbours are the same double and the column's order
   * silently becomes arbitrary. This is the reset, and it is the ONLY operation
   * here that touches more than one row.
   *
   * The moving task is left out on purpose: it is about to be given a midpoint
   * between two of these, so excluding it keeps every gap a whole 1.
   *
   * `updatedAt` is deliberately not bumped — the visible order is identical
   * before and after, and touching every card in a column would invalidate
   * every client cache for a no-op.
   */
  private rebalance(tx: Tx, ownerId: string, status: TaskStatus, movingId: string): void {
    const rows = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.ownerId, ownerId), eq(tasks.status, status), ne(tasks.id, movingId)))
      .orderBy(asc(tasks.position), asc(tasks.id))
      .all()

    rows.forEach((row, i) => {
      tx.update(tasks)
        .set({ position: i + 1 })
        .where(and(eq(tasks.id, row.id), eq(tasks.ownerId, ownerId)))
        .run()
    })
  }

  /**
   * Move a task inside its column, or to another column, in ONE row update:
   * `afterId` names the task it should land directly below, `null` means the
   * top. The new position is the midpoint of the two neighbours — no renumber,
   * unless the gap has been split so thin that a midpoint would collide.
   *
   * `status` omitted means "same column". The anchor is looked up in the TARGET
   * column, so an anchor from a different column reads as unknown.
   *
   * Synchronous, like every transaction here: better-sqlite3 does not await.
   */
  move(
    id: string,
    ownerId: string,
    status: TaskStatus | undefined,
    afterId: string | null,
  ): MoveResult {
    return this.database.db.transaction((tx) => {
      // Ownership checked INSIDE the transaction, so a concurrent delete cannot
      // slip between the check and the write.
      const [task] = tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
        .all()

      if (!task) return 'not-found'

      const target = status ?? task.status
      let position: number

      if (afterId === null) {
        position = this.topPosition(tx, ownerId, target)
      } else {
        // Owner-scoped AND status-scoped: someone else's id, a made-up id and
        // an id sitting in another column are one indistinguishable answer, for
        // the same reason `ownedCategoryIds` gives one — a distinguishable
        // error is an id-enumeration oracle.
        const [anchor] = tx
          .select({ position: tasks.position })
          .from(tasks)
          .where(and(eq(tasks.id, afterId), eq(tasks.ownerId, ownerId), eq(tasks.status, target)))
          .all()

        if (!anchor) return 'unknown-anchor'

        let anchorPos = anchor.position
        let nextPos = this.positionAbove(tx, ownerId, target, id, anchorPos)

        if (nextPos !== null && nextPos - anchorPos < MIN_GAP) {
          this.rebalance(tx, ownerId, target, id)
          // Both neighbours moved, so both are re-read. After a renumber the
          // gap is a whole 1 again, which is why this cannot loop.
          const [renumbered] = tx
            .select({ position: tasks.position })
            .from(tasks)
            .where(and(eq(tasks.id, afterId), eq(tasks.ownerId, ownerId)))
            .all()
          anchorPos = renumbered.position
          nextPos = this.positionAbove(tx, ownerId, target, id, anchorPos)
        }

        position = nextPos === null ? anchorPos + 1 : (anchorPos + nextPos) / 2
      }

      const [row] = tx
        .update(tasks)
        .set({ status: target, position, updatedAt: new Date() })
        .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
        .returning()
        .all()

      return row
    })
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

  /** Delegates: a task with no categories is a task with an empty link set. */
  async create(ownerId: string, input: CreateTaskInput): Promise<Task> {
    return this.createWithCategories(ownerId, input, [])
  }

  /**
   * Delegates: `undefined` categoryIds means "leave the links alone", so this
   * is exactly a column patch — and it inherits the status-change reposition
   * instead of quietly being the one write path that forgets it.
   */
  async update(id: string, ownerId: string, patch: UpdateTaskPatch): Promise<Task | null> {
    return this.updateWithCategories(id, ownerId, patch, undefined)
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
      // `input.status ?? 'todo'` repeats the column default because the
      // position bucket has to be decided BEFORE the insert, and the default
      // only exists after it. The Zod enum keeps the literal honest.
      const status = input.status ?? 'todo'

      const [task] = tx
        .insert(tasks)
        .values({
          ...input,
          status,
          description: input.description ?? null,
          ownerId,
          position: this.topPosition(tx, ownerId, status),
        })
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
      const [current] = tx
        .select({ status: tasks.status })
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
        .all()

      if (!current) return null

      // Changing the status IS moving the card to another column, and the old
      // column's position means nothing in the new one — it would drop the card
      // at an arbitrary height. Same rule as a fresh task: top of the target.
      // A caller that wants a specific slot uses `move`.
      const moved =
        patch.status && patch.status !== current.status
          ? { position: this.topPosition(tx, ownerId, patch.status) }
          : {}

      const [row] = tx
        .update(tasks)
        .set({ ...patch, ...moved, updatedAt: new Date() })
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
