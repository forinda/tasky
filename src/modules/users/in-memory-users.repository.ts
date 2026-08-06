/**
 * In-Memory Users Repository
 *
 * Implements the repository interface using a Map.
 * Useful for prototyping and testing. Replace with a database implementation
 * (Drizzle, Prisma, etc.) for production use.
 *
 * @Repository() registers this class in the DI container as a singleton.
 */
import { randomUUID } from 'node:crypto'
import { Repository, HttpException } from '@forinda/kickjs'
import type { ParsedQuery } from '@forinda/kickjs'
import type { IUsersRepository } from './users.repository'
import type { UsersResponseDTO } from './dtos/users-response.dto'
import type { CreateUsersDTO } from './dtos/create-users.dto'
import type { UpdateUsersDTO } from './dtos/update-users.dto'

@Repository()
export class InMemoryUsersRepository implements IUsersRepository {
  private store = new Map<string, UsersResponseDTO>()

  async findById(id: string): Promise<UsersResponseDTO | null> {
    return this.store.get(id) ?? null
  }

  async findAll(): Promise<UsersResponseDTO[]> {
    return Array.from(this.store.values())
  }

  async findPaginated(parsed: ParsedQuery): Promise<{ data: UsersResponseDTO[]; total: number }> {
    const all = Array.from(this.store.values())
    const data = all.slice(parsed.pagination.offset, parsed.pagination.offset + parsed.pagination.limit)
    return { data, total: all.length }
  }

  async create(dto: CreateUsersDTO): Promise<UsersResponseDTO> {
    const now = new Date().toISOString()
    const entity: UsersResponseDTO = {
      id: randomUUID(),
      ...dto,
      createdAt: now,
      updatedAt: now,
    }
    this.store.set(entity.id, entity)
    return entity
  }

  async update(id: string, dto: UpdateUsersDTO): Promise<UsersResponseDTO> {
    const existing = this.store.get(id)
    if (!existing) throw HttpException.notFound('Users not found')
    const updated = { ...existing, ...dto, updatedAt: new Date().toISOString() }
    this.store.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) throw HttpException.notFound('Users not found')
    this.store.delete(id)
  }
}
