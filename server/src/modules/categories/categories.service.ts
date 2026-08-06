import { Autowired, HttpException, Service, type ParsedQuery } from '@forinda/kickjs'
import type { Category } from '../../db/schema'
import { CategoriesRepository } from './categories.repository'
import type { CreateCategoryDTO } from './dtos/create-category.dto'
import type { UpdateCategoryDTO } from './dtos/update-category.dto'

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

/**
 * SQLite surfaces a unique-index violation as SQLITE_CONSTRAINT_UNIQUE. Match on
 * the code where available and fall back to the message, since the driver wraps
 * errors differently depending on the call path.
 */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT') return true
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

@Service()
export class CategoriesService {
  constructor(@Autowired() private readonly repo: CategoriesRepository) {}

  async list(ownerId: string, parsed: ParsedQuery) {
    const { data, total } = await this.repo.listPaginated(ownerId, parsed)
    return { data: data.map(toCategoryResponse), total }
  }

  async create(ownerId: string, dto: CreateCategoryDTO): Promise<CategoryResponse> {
    try {
      return toCategoryResponse(await this.repo.create(ownerId, dto))
    } catch (error) {
      // Converted from the constraint rather than pre-checked with a SELECT.
      // A read-then-write check loses the race between two concurrent requests;
      // the database is the only authority that cannot. This is the same bug
      // that made signup return 500s under concurrency before it was fixed.
      if (isUniqueViolation(error)) {
        throw HttpException.conflict('A category with that name already exists')
      }
      throw error
    }
  }

  async update(id: string, ownerId: string, dto: UpdateCategoryDTO): Promise<CategoryResponse> {
    let updated: Category | null
    try {
      updated = await this.repo.update(id, ownerId, dto)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw HttpException.conflict('A category with that name already exists')
      }
      throw error
    }

    // 404, not 403 — a 403 would confirm the row exists and hand out an
    // ID-enumeration oracle. Missing and not-yours are indistinguishable by
    // design, and a test asserts the response bodies match exactly.
    if (!updated) throw HttpException.notFound('Category not found')
    return toCategoryResponse(updated)
  }

  async remove(id: string, ownerId: string): Promise<void> {
    if (!(await this.repo.remove(id, ownerId))) {
      throw HttpException.notFound('Category not found')
    }
  }
}
