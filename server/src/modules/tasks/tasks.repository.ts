import { and, asc, count, desc, eq, like, or, sql, type SQL } from 'drizzle-orm'
import { Autowired, Repository, type FilterItem, type ParsedQuery } from '@forinda/kickjs'
import { Database } from '../../db/database'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  tasks,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../../db/schema'

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

  async remove(id: string, ownerId: string): Promise<boolean> {
    const rows = this.database.db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .returning()
      .all()
    return rows.length > 0
  }
}
