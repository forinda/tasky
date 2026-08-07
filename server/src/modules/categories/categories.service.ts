/**
 * COMPATIBILITY SHIM — no service lives here any more.
 *
 * `CategoriesService` was split into one use case per operation under
 * `use-cases/`, and the response mapper moved to `categories.response.ts`.
 * This file survives only because `src/modules/tasks/tasks.service.ts` imports
 * `toCategoryResponse` from this path, and the tasks module is owned by a
 * concurrent refactor — editing it from here would collide.
 *
 * Delete this file once that import points at `./categories.response`; nothing
 * inside the categories module reads it.
 */
export { toCategoryResponse, type CategoryResponse } from './categories.response'
