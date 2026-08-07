import { Autowired, HttpException, Service } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { currentOwnerId } from '@/shared/context'
import { deleteTask } from '../tasks.queries'

@Service()
export class DeleteTaskUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(id: string): Promise<void> {
    const ownerId = currentOwnerId()

    // The delete is itself owner-scoped, so a foreign id removes nothing and
    // reports the same 404 as a missing one.
    if (!deleteTask(this.database.db, id, ownerId)) {
      throw HttpException.notFound('Task not found')
    }
  }
}
