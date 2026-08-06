import { eq } from 'drizzle-orm'
import { Autowired, Repository } from '@forinda/kickjs'
import { Database } from '../../db/database'
import { users, type User } from '../../db/schema'

export interface CreateUserInput {
  email: string
  passwordHash: string
  name: string
}

/** The only place in the app that touches the `users` table. */
@Repository()
export class UsersRepository {
  constructor(@Autowired() private readonly database: Database) {}

  async findByEmail(email: string): Promise<User | null> {
    const [row] = this.database.db.select().from(users).where(eq(users.email, email)).all()
    return row ?? null
  }

  async findById(id: string): Promise<User | null> {
    const [row] = this.database.db.select().from(users).where(eq(users.id, id)).all()
    return row ?? null
  }

  async create(input: CreateUserInput): Promise<User> {
    const [row] = this.database.db.insert(users).values(input).returning().all()
    return row
  }
}
