export const categoryKeys = {
  all: ['categories'] as const,
  list: () => [...categoryKeys.all, 'list'] as const,
  /**
   * Task counts per category. Filed under categories rather than tasks because
   * it is the categories screen that needs it and a category write is what
   * invalidates it — even though the row data comes off `/tasks/grouped`.
   */
  counts: () => [...categoryKeys.all, 'counts'] as const,
}
