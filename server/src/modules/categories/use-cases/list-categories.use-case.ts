import { Autowired, Service, type ParsedQuery } from '@forinda/kickjs'
import { Database } from '@/db/database'
import { toCategoryResponse } from '../categories.response'
import { currentOwnerId } from '@/shared/context'
import { listCategoriesPage } from '../categories.queries'

@Service()
export class ListCategoriesUseCase {
  constructor(@Autowired() private readonly database: Database) {}

  async execute(parsed: ParsedQuery) {
    // Read from the request context, not from a parameter. An owner id that can
    // be passed in is an owner id a caller can get wrong; there is exactly one
    // correct value per request and this is where it comes from.
    const { data, total } = await listCategoriesPage(
      this.database.db,
      currentOwnerId(),
      parsed,
    )
    return { data: data.map(toCategoryResponse), total }
  }
}
