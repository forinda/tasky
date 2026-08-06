/**
 * Users Repository Interface
 *
 * Defines the contract for data access.
 * The interface declares what operations are available;
 * implementations (in-memory, Drizzle, Prisma) fulfill the contract.
 *
 * To swap implementations, change the factory in the module's register() method.
 */
import { createToken } from '@forinda/kickjs'
import type { UsersResponseDTO } from './dtos/users-response.dto'
import type { CreateUsersDTO } from './dtos/create-users.dto'
import type { UpdateUsersDTO } from './dtos/update-users.dto'
import type { ParsedQuery } from '@forinda/kickjs'

export interface IUsersRepository {
  findById(id: string): Promise<UsersResponseDTO | null>
  findAll(): Promise<UsersResponseDTO[]>
  findPaginated(parsed: ParsedQuery): Promise<{ data: UsersResponseDTO[]; total: number }>
  create(dto: CreateUsersDTO): Promise<UsersResponseDTO>
  update(id: string, dto: UpdateUsersDTO): Promise<UsersResponseDTO>
  delete(id: string): Promise<void>
}

/**
 * Collision-safe DI token bound to `IUsersRepository`.
 * `container.resolve(USERS_REPOSITORY)` and
 * `@Inject(USERS_REPOSITORY)` both return the typed
 * interface — no manual generic, no `any` cast.
 *
 * The `'adero-api/'` prefix matches the project scope so
 * `kick-lint`'s `token-reserved-prefix` rule never fires —
 * adopters must NOT use the reserved `'kick/'` namespace.
 */
export const USERS_REPOSITORY = createToken<IUsersRepository>('adero-api/Users/repository')
