import { and, asc, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm'
import { Autowired, Repository, type FilterItem, type ParsedQuery } from '@forinda/kickjs'
import { Database } from '@/db/database'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  categories,
  taskCategories,
  tasks,
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
      const term = `%${parsed.search}%`
      conditions.push(or(like(tasks.title, term), like(tasks.description, term)))
    }

    return and(...conditions.filter((c): c is SQL => c !== undefined))
  }

  async listPaginated(
    ownerId: string,
    parsed: ParsedQuery,
  ): Promise<{ data: Task[]; total: number }> {
    const where = this.scope(ownerId, parsed)

    const [sort] = parsed.sort
    const column =
      sort && sort.field in SORTABLE
        ? SORTABLE[sort.field as keyof typeof SORTABLE]
        : tasks.createdAt
    const direction = sort?.direction === 'desc' ? desc : asc

    const data = this.database.db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(direction(column))
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

  async remove(id: string, ownerId: string): Promise<boolean> {
    const rows = this.database.db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .returning()
      .all()
    return rows.length > 0
  }
}
