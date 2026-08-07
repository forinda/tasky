import type { Category } from '@/db/schema'

/** Response shape. Explicit field list — never a spread of the row. */
export interface CategoryResponse {
  id: string
  name: string
  color: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Note what is absent: `ownerId`. It is an internal fact, and echoing it back
 * tells a client about a dimension it has no business reasoning over.
 */
export function toCategoryResponse(category: Category): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }
}
