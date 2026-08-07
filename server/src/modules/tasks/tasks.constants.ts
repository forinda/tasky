// Not `as const`: QueryFieldConfig declares mutable `string[]`, so a readonly
// tuple is not assignable.
export const TASK_QUERY_CONFIG = {
  // `categoryId` filters through the task_categories join table, so it has no
  // column on `tasks` — see the EXISTS predicate in tasks.queries.ts.
  filterable: ['status', 'priority', 'categoryId'],
  // `position` is only meaningful within one status — sorting an unfiltered
  // list by it interleaves three columns' orderings. It stays sortable anyway
  // (a client asking for it is asking for a column's order) and it is the
  // DEFAULT order once `filter=status:eq:…` names a column; see
  // `ordering` in tasks.queries.ts.
  sortable: ['createdAt', 'updatedAt', 'priority', 'status', 'title', 'position'],
  searchable: ['title', 'description'],
}
