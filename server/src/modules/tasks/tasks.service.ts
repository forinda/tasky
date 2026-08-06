import { Autowired, HttpException, Service, type ParsedQuery } from '@forinda/kickjs'
import { TASK_PRIORITIES, TASK_STATUSES, type Task } from '@/db/schema'
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
      if (allowed && !allowed.includes(filter.value)) {
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

    // `{ categoryIds: [...] }` alone is a valid patch that touches no column.
    const task =
      Object.keys(patch).length > 0
        ? await this.repo.update(id, ownerId, patch)
        : await this.repo.findById(id, ownerId)
    if (!task) throw HttpException.notFound('Task not found')

    if (categoryIds && !this.repo.replaceCategories(id, ownerId, categoryIds)) {
      throw HttpException.notFound('Task not found')
    }

    return toTaskResponse(task, categoryIds ?? this.repo.findCategoryIds(id))
  }

  async remove(id: string, ownerId: string): Promise<void> {
    if (!(await this.repo.remove(id, ownerId))) {
      throw HttpException.notFound('Task not found')
    }
  }
}
