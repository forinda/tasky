// Not `as const`: QueryFieldConfig declares mutable `string[]`, so a readonly
// tuple is not assignable.
export const TASK_QUERY_CONFIG = {
  // `categoryId` filters through the task_categories join table, so it has no
  // column on `tasks` — see the EXISTS predicate in tasks.repository.ts.
  filterable: ['status', 'priority', 'categoryId'],
  sortable: ['createdAt', 'updatedAt', 'priority', 'status', 'title'],
  searchable: ['title', 'description'],
}
