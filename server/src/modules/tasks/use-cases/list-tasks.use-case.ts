import { Autowired, Service, type ParsedQuery } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { currentOwnerId } from '@/shared/context'
import { findCategoryIds, selectPaginated } from '../tasks.queries'
import { assertKnownFilterValues, toTaskResponse, type TaskResponse } from '../tasks.types'

@Service()
export class ListTasksUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(parsed: ParsedQuery): Promise<{ data: TaskResponse[]; total: number }> {
    // Rejected before the query is built, so a bad filter never reaches SQL.
    assertKnownFilterValues(parsed)

    const ownerId = currentOwnerId()
    const { data, total } = selectPaginated(this.database.db, ownerId, parsed)

    // ponytail: one link query per row (N+1), bounded by the page limit.
    // Story 6's relational `db.query` fetch replaces it if it ever shows up.
    return {
      data: data.map((task) => toTaskResponse(task, findCategoryIds(this.database.db, task.id))),
      total,
    }
  }
}
