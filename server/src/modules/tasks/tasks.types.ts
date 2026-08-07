import { HttpException, type ParsedQuery } from '@forinda/kickjs'
import { TASK_PRIORITIES, TASK_STATUSES, type Task } from '@/db/schema'
import type { CategoryResponse } from '@/modules/categories/categories.response'

/** Response shape. Explicit field list — never a spread of the row. */
export interface TaskResponse {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  // Exposed so a client holding a cached column can keep it in the server's
  // order without a refetch. The VALUE is meaningless on its own — only the
  // comparison within one status is — and a client never sends it back: moves
  // name a neighbour id, not a float.
  position: number
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
    position: task.position,
    categoryIds,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

/** One board column. `category: null` is the uncategorized bucket. */
export interface GroupedColumn {
  category: CategoryResponse | null
  tasks: TaskResponse[]
}

/**
 * The board is not paginated — a column with half its cards is a lie about the
 * work — but it is not unbounded either. 500 JOINED ROWS, not 500 tasks: a task
 * in three categories spends three of them.
 */
export const GROUPED_CAP = 500

/** The filterable fields whose values are closed sets. */
const FILTER_ENUMS: Record<string, readonly string[]> = {
  status: TASK_STATUSES,
  priority: TASK_PRIORITIES,
}

/**
 * `parsed.filters` carries raw strings. A filter naming a known field with a
 * value outside the enum is rejected rather than quietly matching nothing —
 * an empty list is indistinguishable from "you have no tasks", so the client
 * would show a wrong-but-plausible board and never know.
 *
 * An unknown *field* is not an error: the framework drops it before it gets
 * here, per the allow-list in TASK_QUERY_CONFIG.
 */
export function assertKnownFilterValues(parsed: ParsedQuery): void {
  for (const filter of parsed.filters) {
    // The framework parses the operator (eq/neq/gt/contains/…) but the
    // queries only implement `eq`. Silently treating `neq` as `eq` returns
    // the exact INVERSE of what was asked — a wrong answer the client cannot
    // detect. Reject until an operator is actually supported.
    //
    // This runs for EVERY filterable field. It used to sit behind the enum
    // lookup below, which meant any field without a closed set of values
    // skipped it — and `categoryId`, the first such field, would have
    // re-opened the exact bug this guard was written to close. Keep it above
    // the `continue`.
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
    if (!allowed) continue

    if (!allowed.includes(filter.value)) {
      throw HttpException.unprocessable(
        `Invalid ${filter.field} filter '${filter.value}'. Expected one of: ${allowed.join(', ')}`,
      )
    }
  }
}
