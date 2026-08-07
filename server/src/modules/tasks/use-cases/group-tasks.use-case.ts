import { Autowired, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import type { Task } from '@/db/schema'
import { toCategoryResponse } from '@/modules/categories/categories.response'
import { currentOwnerId } from '@/shared/context'
import { selectGrouped } from '../tasks.queries'
import { GROUPED_CAP, toTaskResponse, type GroupedBoard, type TaskResponse } from '../tasks.types'

/**
 * The board. One pass over the flat join rows folds each task's links back
 * together, so nothing re-queries links per task.
 *
 * A task in two categories appears in BOTH columns — that is what a
 * many-to-many board means, not double-counting. Every owned category gets a
 * column even with no tasks: a column that vanishes when emptied is a board
 * you cannot drag a card back onto. The uncategorized bucket is last and
 * always present, so the client never has to synthesize it.
 *
 * `truncated` rides along because the cap is a server decision: a client that
 * has to infer it from a row count needs its own copy of GROUPED_CAP, and that
 * copy goes stale without failing.
 */
@Service()
export class GroupTasksUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(): Promise<GroupedBoard> {
    const ownerId = currentOwnerId()
    const { rows, categories, truncated } = selectGrouped(this.database.db, ownerId, GROUPED_CAP)

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

    return {
      columns: [
        ...categories.map((c) => ({ category: toCategoryResponse(c), tasks: columns.get(c.id)! })),
        { category: null, tasks: uncategorized },
      ],
      truncated,
    }
  }
}
