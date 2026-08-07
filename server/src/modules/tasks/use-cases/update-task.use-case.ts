import { Autowired, HttpException, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { currentOwnerId } from '@/shared/context'
import type { UpdateTaskDTO } from '../dtos/update-task.dto'
import { assertOwnedCategories, findCategoryIds, patchTask } from '../tasks.queries'
import { toTaskResponse, type TaskResponse } from '../tasks.types'

@Service()
export class UpdateTaskUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(id: string, dto: UpdateTaskDTO): Promise<TaskResponse> {
    const ownerId = currentOwnerId()
    const { categoryIds, ...patch } = dto

    // Validate before writing anything, so a bad id cannot half-apply a patch.
    if (categoryIds) assertOwnedCategories(this.database.db, ownerId, categoryIds)

    // ONE transaction for the columns and the links. Running the patch and the
    // link replacement separately means a failure in the link step commits the
    // column patch anyway and the client sees a half-applied write.
    //
    // The column patch is unconditional, including for a `{ categoryIds }`-only
    // body: `.set({ ...patch, updatedAt })` is valid with an empty patch, and
    // skipping it would leave `updatedAt` stale after a change the client can
    // see — breaking polling, caching, and sort=updatedAt.
    //
    // Synchronous: better-sqlite3 transactions do not await.
    const task = patchTask(this.database.db, id, ownerId, patch, categoryIds)
    if (!task) throw HttpException.notFound('Task not found')

    return toTaskResponse(task, categoryIds ?? findCategoryIds(this.database.db, id))
  }
}
