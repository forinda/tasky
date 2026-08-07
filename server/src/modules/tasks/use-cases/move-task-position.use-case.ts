import { Autowired, HttpException, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { currentOwnerId } from '@/shared/context'
import type { MoveTaskDTO } from '../dtos/move-task.dto'
import { findCategoryIds, movePosition } from '../tasks.queries'
import { toTaskResponse, type TaskResponse } from '../tasks.types'

/**
 * Reorder within a column, or move to another one — the board's drag-drop.
 * One row update; see `movePosition` in tasks.queries.ts for why the client
 * sends a neighbour id rather than a position, and why the whole thing runs
 * inside a transaction.
 */
@Service()
export class MoveTaskPositionUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(id: string, dto: MoveTaskDTO): Promise<TaskResponse> {
    // Checked before anything is read, and on the caller's own two values, so
    // it reveals nothing about what exists.
    if (dto.afterId === id) {
      throw HttpException.unprocessable('A task cannot be placed after itself')
    }

    const ownerId = currentOwnerId()
    const result = movePosition(this.database.db, id, ownerId, dto.status, dto.afterId)

    // Same 404 as `get` — missing and not-yours stay indistinguishable.
    if (result === 'not-found') throw HttpException.notFound('Task not found')
    // Unknown, someone else's, or in a different column: one message, for the
    // same reason unknown category ids get one. The id is NOT echoed back —
    // unlike the category message, which names which of several were rejected,
    // there is one anchor and the client already knows what it sent, so echoing
    // it only makes two 422 bodies distinguishable to no one's benefit.
    if (result === 'unknown-anchor') throw HttpException.unprocessable('Unknown task')

    return toTaskResponse(result, findCategoryIds(this.database.db, id))
  }
}
