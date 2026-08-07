import { Autowired, HttpException, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { toCategoryResponse, type CategoryResponse } from '../categories.response'
import { currentOwnerId } from '@/shared/context'
import { isUniqueViolation, updateCategory } from '../categories.queries'
import type { UpdateCategoryDTO } from '../dtos/update-category.dto'

@Service()
export class UpdateCategoryUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(id: string, dto: UpdateCategoryDTO): Promise<CategoryResponse> {
    let updated
    try {
      updated = await updateCategory(this.database.db, currentOwnerId(), id, dto)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw HttpException.conflict('A category with that name already exists')
      }
      throw error
    }

    // 404, not 403 — a 403 would confirm the row exists and hand out an
    // ID-enumeration oracle. Missing and not-yours are indistinguishable by
    // design, and a test asserts the response BODIES match exactly, not just
    // the status.
    if (!updated) throw HttpException.notFound('Category not found')
    return toCategoryResponse(updated)
  }
}
