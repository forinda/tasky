import { Autowired, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { currentOwnerId } from '@/shared/context'
import type { CreateTaskDTO } from '../dtos/create-task.dto'
import { assertOwnedCategories, insertTask } from '../tasks.queries'
import { toTaskResponse, type TaskResponse } from '../tasks.types'

@Service()
export class CreateTaskUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(dto: CreateTaskDTO): Promise<TaskResponse> {
    const ownerId = currentOwnerId()
    const { categoryIds = [], ...input } = dto

    // Before the write, so a foreign category id cannot half-create a task.
    assertOwnedCategories(this.database.db, ownerId, categoryIds)

    // Synchronous by necessity — insertTask runs a better-sqlite3
    // transaction, which cannot await.
    const task = insertTask(this.database.db, ownerId, input, categoryIds)

    return toTaskResponse(task, categoryIds)
  }
}
