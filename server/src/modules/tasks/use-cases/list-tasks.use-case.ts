import { Autowired, Service, type ParsedQuery } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { currentOwnerId } from '@/shared/context'
import { findCategoryIdsByTask, selectPaginated } from '../tasks.queries'
import { assertKnownFilterValues, toTaskResponse, type TaskResponse } from '../tasks.types'

@Service()
export class ListTasksUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(parsed: ParsedQuery): Promise<{ data: TaskResponse[]; total: number }> {
    // Rejected before the query is built, so a bad filter never reaches SQL.
    assertKnownFilterValues(parsed)

    const ownerId = currentOwnerId()
    const { data, total } = selectPaginated(this.database.db, ownerId, parsed)

    // ONE query for the whole page's links, not one per row. Owner-scoped
    // inside the helper, so the batch cannot widen what the page already
    // narrowed. `?? []` is unreachable — every requested id is seeded — but
    // the compiler wants it and an empty column beats a crash.
    const links = findCategoryIdsByTask(
      this.database.db,
      ownerId,
      data.map((task) => task.id),
    )

    return {
      data: data.map((task) => toTaskResponse(task, links.get(task.id) ?? [])),
      total,
    }
  }
}
