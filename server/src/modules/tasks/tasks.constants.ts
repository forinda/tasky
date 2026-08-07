// Not `as const`: QueryFieldConfig declares mutable `string[]`, so a readonly
// tuple is not assignable.
export const TASK_QUERY_CONFIG = {
  filterable: ['status', 'priority'],
  sortable: ['createdAt', 'updatedAt', 'priority', 'status', 'title'],
  searchable: ['title', 'description'],
}
