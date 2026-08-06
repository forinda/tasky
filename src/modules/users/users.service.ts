import { Service, Inject, HttpException } from '@forinda/kickjs'
import type { ParsedQuery } from '@forinda/kickjs'
import { USERS_REPOSITORY, type IUsersRepository } from './users.repository'
import type { UsersResponseDTO } from './dtos/users-response.dto'
import type { CreateUsersDTO } from './dtos/create-users.dto'
import type { UpdateUsersDTO } from './dtos/update-users.dto'

@Service()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly repo: IUsersRepository,
  ) {}

  async findById(id: string): Promise<UsersResponseDTO | null> {
    return this.repo.findById(id)
  }

  async findAll(): Promise<UsersResponseDTO[]> {
    return this.repo.findAll()
  }

  async findPaginated(parsed: ParsedQuery) {
    return this.repo.findPaginated(parsed)
  }

  async create(dto: CreateUsersDTO): Promise<UsersResponseDTO> {
    return this.repo.create(dto)
  }

  async update(id: string, dto: UpdateUsersDTO): Promise<UsersResponseDTO> {
    return this.repo.update(id, dto)
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id)
  }
}
