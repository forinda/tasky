import { Autowired, HttpException, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { currentOwnerId } from '@/shared/context'
import { deleteCategory } from '../categories.queries'

@Service()
export class DeleteCategoryUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(id: string): Promise<void> {
    // Only the join rows cascade — the tasks themselves survive. See the
    // ON DELETE CASCADE on task_categories in db/schema.
    if (!(await deleteCategory(this.database.db, currentOwnerId(), id))) {
      throw HttpException.notFound('Category not found')
    }
  }
}
