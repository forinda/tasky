import { Autowired, HttpException, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { toCategoryResponse, type CategoryResponse } from '../categories.response'
import { currentOwnerId } from '@/shared/context'
import { insertCategory, isUniqueViolation } from '../categories.queries'
import type { CreateCategoryDTO } from '../dtos/create-category.dto'

@Service()
export class CreateCategoryUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(dto: CreateCategoryDTO): Promise<CategoryResponse> {
    try {
      const created = await insertCategory(this.database.db, currentOwnerId(), dto)
      return toCategoryResponse(created)
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
}
