import { Autowired, HttpException, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { currentOwnerId } from '@/shared/context'
import { findCategoryIds, selectById } from '../tasks.queries'
import { toTaskResponse, type TaskResponse } from '../tasks.types'

@Service()
export class GetTaskUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(id: string): Promise<TaskResponse> {
    const ownerId = currentOwnerId()
    const task = selectById(this.database.db, id, ownerId)

    // 404, not 403 — a 403 would confirm the row exists and hand out an
    // ID-enumeration oracle. Missing and not-yours are identical by design,
    // down to the body: the message is constant and the id is never echoed.
    if (!task) throw HttpException.notFound('Task not found')

    return toTaskResponse(task, findCategoryIds(this.database.db, task.id))
  }
}
