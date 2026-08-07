import { Autowired, Repository, type ParsedQuery } from '@forinda/kickjs'
import { Database } from '@/db/database'
import type { Task, TaskStatus } from '@/db/schema'
import {
  deleteTask,
  findCategoryIds,
  insertTask,
  movePosition,
  ownedCategoryIds,
  patchTask,
  replaceCategories,
  selectByCategory,
  selectById,
  selectPaginated,
  type CreateTaskInput,
  type MoveResult,
  type UpdateTaskPatch,
} from './tasks.queries'

export type { CreateTaskInput, MoveResult, UpdateTaskPatch }

/**
 * RETAINED SHIM — not the shape this module wants.
 *
 * The tasks HTTP path no longer goes through here: each operation is a use case
 * that calls `tasks.queries.ts` directly. This class survives because two
 * callers outside this refactor's blast radius still bind to it:
 *
 *   - `categories.service.ts` DI-injects `TasksRepository` for the
 *     `/categories/:id/tasks` route (`listByCategory` + `findCategoryIds`).
 *     Categories was explicitly out of scope, so the injection point stands.
 *   - four test files construct it directly and drive it method by method.
 *
 * Every method is a one-line delegation, so there is exactly ONE implementation
 * of each query and the shim cannot drift from what the use cases run. Deleting
 * it is a categories-module change, not a tasks-module one — that is the whole
 * remaining cost of the split.
 */
@Repository()
export class TasksRepository {
  constructor(@Autowired() private readonly database: Database) {}

  async listPaginated(
    ownerId: string,
    parsed: ParsedQuery,
  ): Promise<{ data: Task[]; total: number }> {
    return selectPaginated(this.database.db, ownerId, parsed)
  }

  async listByCategory(
    ownerId: string,
    categoryId: string,
    parsed: ParsedQuery,
  ): Promise<{ data: Task[]; total: number }> {
    return selectByCategory(this.database.db, ownerId, categoryId, parsed)
  }

  async findById(id: string, ownerId: string): Promise<Task | null> {
    return selectById(this.database.db, id, ownerId)
  }

  /** Delegates: a task with no categories is a task with an empty link set. */
  async create(ownerId: string, input: CreateTaskInput): Promise<Task> {
    return insertTask(this.database.db, ownerId, input, [])
  }

  /**
   * Delegates: `undefined` categoryIds means "leave the links alone", so this
   * is exactly a column patch — and it inherits the status-change reposition
   * instead of quietly being the one write path that forgets it.
   */
  async update(id: string, ownerId: string, patch: UpdateTaskPatch): Promise<Task | null> {
    return patchTask(this.database.db, id, ownerId, patch, undefined)
  }

  async remove(id: string, ownerId: string): Promise<boolean> {
    return deleteTask(this.database.db, id, ownerId)
  }

  /** Synchronous: callers use it before opening a transaction. */
  ownedCategoryIds(ownerId: string, ids: string[]): string[] {
    return ownedCategoryIds(this.database.db, ownerId, ids)
  }

  /** Synchronous — used inside and outside transactions. */
  findCategoryIds(taskId: string): string[] {
    return findCategoryIds(this.database.db, taskId)
  }

  /** Synchronous by necessity: better-sqlite3 transactions do not await. */
  createWithCategories(ownerId: string, input: CreateTaskInput, categoryIds: string[]): Task {
    return insertTask(this.database.db, ownerId, input, categoryIds)
  }

  /** Synchronous, for the same reason as above. */
  replaceCategories(taskId: string, ownerId: string, categoryIds: string[]): boolean {
    return replaceCategories(this.database.db, taskId, ownerId, categoryIds)
  }

  /** Synchronous, for the same reason as above. */
  updateWithCategories(
    id: string,
    ownerId: string,
    patch: UpdateTaskPatch,
    categoryIds: string[] | undefined,
  ): Task | null {
    return patchTask(this.database.db, id, ownerId, patch, categoryIds)
  }

  /** Synchronous, for the same reason as above. */
  move(
    id: string,
    ownerId: string,
    status: TaskStatus | undefined,
    afterId: string | null,
  ): MoveResult {
    return movePosition(this.database.db, id, ownerId, status, afterId)
  }
}
