import { Autowired, HttpException, Service, type ParsedQuery } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/db/schema'
import { findCategoryIds, selectByCategory } from '@/modules/tasks/tasks.queries'
import { toTaskResponse } from '@/modules/tasks/tasks.types'
import { currentOwnerId } from '@/shared/context'
import { findCategory } from '../categories.queries'

/** The filterable fields whose values are closed sets. */
const FILTER_ENUMS: Record<string, readonly string[]> = {
  status: TASK_STATUSES,
  priority: TASK_PRIORITIES,
}

/**
 * DUPLICATED from `TasksService.assertKnownFilterValues`
 * (`src/modules/tasks/tasks.service.ts`). That method is `private`, so there is
 * nothing to import, and the tasks module is owned by a concurrent refactor —
 * copying three lines beats reaching into someone else's file mid-flight.
 * Delete this and import the original the day it is exported.
 *
 * Why it has to be here at all: this route reuses TASK_QUERY_CONFIG, so it
 * accepts the same filters `/tasks` does and hands them to the same
 * `selectByCategory`'s owner scope. That scope degrades an unknown enum value to
 * `1 = 0` and ignores the operator entirely — so `?filter=status:bogus`
 * returned an empty page here while `/tasks` returned 422, and `status:neq:done`
 * returned the exact INVERSE of what was asked. An empty page is
 * indistinguishable from "this category is empty", which is the
 * silent-wrong-answer class this project has already fixed twice.
 *
 * Runs BEFORE the category lookup, matching `/tasks`: a malformed request is
 * rejected on its own terms, and because it runs before the lookup it runs
 * identically for an unknown id and someone else's — so it opens no oracle.
 */
function assertKnownFilterValues(parsed: ParsedQuery): void {
  for (const filter of parsed.filters) {
    // The framework parses the operator (eq/neq/gt/contains/…) but the
    // repository only implements `eq`. Silently treating `neq` as `eq` returns
    // the exact inverse of what was asked — a wrong answer the client cannot
    // detect. This runs for EVERY filterable field, not just the enum ones:
    // behind the enum lookup it would skip `categoryId` and re-open the bug.
    if (filter.operator !== 'eq') {
      throw HttpException.unprocessable(
        `Unsupported operator '${filter.operator}' for ${filter.field}. Only 'eq' is supported.`,
      )
    }

    // Value validation only where the field has a closed set. `categoryId`
    // deliberately has none: an id that is not yours matches nothing, and
    // reporting it as invalid would let a client probe for other users'
    // category ids one 422 at a time — the oracle closed everywhere else.
    const allowed = FILTER_ENUMS[filter.field]
    if (allowed && !allowed.includes(filter.value)) {
      throw HttpException.unprocessable(
        `Invalid ${filter.field} filter '${filter.value}'. Expected one of: ${allowed.join(', ')}`,
      )
    }
  }
}

/**
 * Tasks inside one category. Categories owns the ROUTE because the URL is
 * category-shaped; tasks owns the DATA, so the rows come from tasks.queries
 * rather than a second tasks query written here.
 */
@Service()
export class ListCategoryTasksUseCase {
  constructor(
    @Autowired() private readonly database: Database,
  ) {}

  /**
   * The 404 comes off the CATEGORY lookup, never off an empty page:
   * `listByCategory` returns `{ data: [], total: 0 }` for another owner's
   * category id, which is exactly what a real empty category returns. Deciding
   * from the page would make "not yours" indistinguishable from "yours but
   * empty" in the wrong direction — a 200 leaking that the id is valid.
   */
  async execute(categoryId: string, parsed: ParsedQuery) {
    assertKnownFilterValues(parsed)

    const ownerId = currentOwnerId()
    if (!(await findCategory(this.database.db, ownerId, categoryId))) {
      throw HttpException.notFound('Category not found')
    }

    const { data, total } = selectByCategory(this.database.db, ownerId, categoryId, parsed)
    // ponytail: one link query per row (N+1), bounded by the page limit — same
    // ceiling TasksService.list already carries. Fix both together or neither.
    return {
      data: data.map((task) => toTaskResponse(task, findCategoryIds(this.database.db, task.id))),
      total,
    }
  }
}
