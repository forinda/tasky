/**
 * RETAINED RE-EXPORT — the service class itself is gone.
 *
 * `TasksService` dissolved into `use-cases/`, one class per operation. Its
 * response shape did not: `categories.service.ts` imports `toTaskResponse` from
 * this path and `categories.controller.ts` imports the `TaskResponse` type from
 * it, and the categories module was out of scope for this refactor.
 *
 * So this file is two re-exports and nothing else. Point the two categories
 * imports at `tasks.types.ts` and it can be deleted outright — that is a
 * one-line change in each, deliberately left for whoever owns that module.
 */
export { toTaskResponse, type GroupedColumn, type TaskResponse } from './tasks.types'
