import { Autowired, HttpException, Service, type ParsedQuery } from '@forinda/kickjs'
import { TASK_PRIORITIES, TASK_STATUSES, type Task } from '@/db/schema'
import { toCategoryResponse, type CategoryResponse } from '@/modules/categories/categories.service'
import type { CreateTaskDTO } from './dtos/create-task.dto'
import type { UpdateTaskDTO } from './dtos/update-task.dto'
import { TasksRepository } from './tasks.repository'

/** Response shape. Explicit field list — never a spread of the row. */
export interface TaskResponse {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  categoryIds: string[]
  createdAt: Date
  updatedAt: Date
}

/** Note what is absent: `ownerId`. Internal, and no client's business. */
export function toTaskResponse(task: Task, categoryIds: string[]): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    categoryIds,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

/** One board column. `category: null` is the uncategorized bucket. */
export interface GroupedColumn {
  category: CategoryResponse | null
  tasks: TaskResponse[]
}

/**
 * The board is not paginated — a column with half its cards is a lie about the
 * work — but it is not unbounded either. 500 JOINED ROWS, not 500 tasks: a task
 * in three categories spends three of them.
 */
const GROUPED_CAP = 500

/** The filterable fields whose values are closed sets. */
const FILTER_ENUMS: Record<string, readonly string[]> = {
  status: TASK_STATUSES,
  priority: TASK_PRIORITIES,
}

@Service()
export class TasksService {
  constructor(@Autowired() private readonly repo: TasksRepository) {}

  /**
   * `parsed.filters` carries raw strings. A filter naming a known field with a
   * value outside the enum is rejected rather than quietly matching nothing —
   * an empty list is indistinguishable from "you have no tasks", so the client
   * would show a wrong-but-plausible board and never know.
   *
   * An unknown *field* is not an error: the framework drops it before it gets
   * here, per the allow-list in TASK_QUERY_CONFIG.
   */
  private assertKnownFilterValues(parsed: ParsedQuery): void {
    for (const filter of parsed.filters) {
      const allowed = FILTER_ENUMS[filter.field]
      if (!allowed) continue

      // The framework parses the operator (eq/neq/gt/contains/…) but the
      // repository only implements `eq`. Silently treating `neq` as `eq`
      // returns the exact INVERSE of what was asked — a wrong answer the
      // client cannot detect. Reject until an operator is actually supported.
      if (filter.operator !== 'eq') {
        throw HttpException.unprocessable(
          `Unsupported operator '${filter.operator}' for ${filter.field}. Only 'eq' is supported.`,
        )
      }

      if (!allowed.includes(filter.value)) {
        throw HttpException.unprocessable(
          `Invalid ${filter.field} filter '${filter.value}'. Expected one of: ${allowed.join(', ')}`,
        )
      }
    }
  }

  /**
   * Every category id must belong to the caller, checked BEFORE any write.
   * Unknown and unowned are reported identically — a distinct message would
   * let a client probe for other users' category ids one 422 at a time.
   */
  private assertOwnedCategories(ownerId: string, categoryIds: string[]): void {
    if (categoryIds.length === 0) return

    const owned = this.repo.ownedCategoryIds(ownerId, categoryIds)
    const rejected = categoryIds.filter((id) => !owned.includes(id))
    if (rejected.length > 0) {
      throw HttpException.unprocessable(`Unknown category: ${rejected.join(', ')}`)
    }
  }

  async list(ownerId: string, parsed: ParsedQuery) {
    this.assertKnownFilterValues(parsed)

    const { data, total } = await this.repo.listPaginated(ownerId, parsed)
    // ponytail: one link query per row (N+1), bounded by the page limit.
    // Story 6's relational `db.query` fetch replaces it if it ever shows up.
    return {
      data: data.map((task) => toTaskResponse(task, this.repo.findCategoryIds(task.id))),
      total,
    }
  }

  /**
   * The board. One pass over the flat join rows folds each task's links back
   * together, so nothing re-queries links per task.
   *
   * A task in two categories appears in BOTH columns — that is what a
   * many-to-many board means, not double-counting. Every owned category gets a
   * column even with no tasks: a column that vanishes when emptied is a board
   * you cannot drag a card back onto. The uncategorized bucket is last and
   * always present, so the client never has to synthesize it.
   */
  grouped(ownerId: string): GroupedColumn[] {
    const { rows, categories } = this.repo.listGrouped(ownerId, GROUPED_CAP)

    // Map keeps first-seen order, and the rows arrive oldest-first.
    const seen = new Map<string, { task: Task; categoryIds: string[] }>()
    for (const { task, categoryId } of rows) {
      const entry = seen.get(task.id) ?? { task, categoryIds: [] }
      if (categoryId) entry.categoryIds.push(categoryId)
      seen.set(task.id, entry)
    }

    const columns = new Map(categories.map((c) => [c.id, [] as TaskResponse[]]))
    const uncategorized: TaskResponse[] = []

    for (const { task, categoryIds } of seen.values()) {
      const response = toTaskResponse(task, categoryIds)
      if (categoryIds.length === 0) uncategorized.push(response)
      // `?.` and not `!`: both queries are owner-scoped, so a link to a column
      // that isn't here cannot happen — and if it ever does, dropping the card
      // beats throwing the whole board away.
      else for (const id of categoryIds) columns.get(id)?.push(response)
    }

    return [
      ...categories.map((c) => ({ category: toCategoryResponse(c), tasks: columns.get(c.id)! })),
      { category: null, tasks: uncategorized },
    ]
  }

  async get(id: string, ownerId: string): Promise<TaskResponse> {
    const task = await this.repo.findById(id, ownerId)
    // 404, not 403 — a 403 would confirm the row exists and hand out an
    // ID-enumeration oracle. Missing and not-yours are identical by design.
    if (!task) throw HttpException.notFound('Task not found')
    return toTaskResponse(task, this.repo.findCategoryIds(task.id))
  }

  async create(ownerId: string, dto: CreateTaskDTO): Promise<TaskResponse> {
    const { categoryIds = [], ...input } = dto
    this.assertOwnedCategories(ownerId, categoryIds)

    // Synchronous by necessity — createWithCategories runs a better-sqlite3
    // transaction, which cannot await.
    const task = this.repo.createWithCategories(ownerId, input, categoryIds)
    return toTaskResponse(task, categoryIds)
  }

  async update(id: string, ownerId: string, dto: UpdateTaskDTO): Promise<TaskResponse> {
    const { categoryIds, ...patch } = dto
    // Validate before writing anything, so a bad id cannot half-apply a patch.
    if (categoryIds) this.assertOwnedCategories(ownerId, categoryIds)

    // ONE transaction for the columns and the links. The previous update +
    // replaceCategories pair ran two, so a failure in the link step committed
    // the column patch anyway and the client saw a half-applied write.
    //
    // The column patch is unconditional, including for a `{ categoryIds }`-only
    // body: `.set({ ...patch, updatedAt })` is valid with an empty patch, and
    // skipping it would leave `updatedAt` stale after a change the client can
    // see — breaking polling, caching, and sort=updatedAt.
    //
    // Synchronous: better-sqlite3 transactions do not await.
    const task = this.repo.updateWithCategories(id, ownerId, patch, categoryIds)
    if (!task) throw HttpException.notFound('Task not found')

    return toTaskResponse(task, categoryIds ?? this.repo.findCategoryIds(id))
  }

  async remove(id: string, ownerId: string): Promise<void> {
    if (!(await this.repo.remove(id, ownerId))) {
      throw HttpException.notFound('Task not found')
    }
  }
}
