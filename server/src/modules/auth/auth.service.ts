import { Autowired, HttpException, Service } from '@forinda/kickjs'
import type { User } from '../../db/schema'
import { UsersRepository } from './users.repository'
import { Tokens } from './tokens'
import { hashPassword, verifyPassword } from './password'
import type { SignupDTO } from './dtos/signup.dto'
import type { LoginDTO } from './dtos/login.dto'

/** The user shape that leaves the API. Deliberately has no passwordHash. */
export interface PublicUser {
  id: string
  email: string
  name: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Built from an explicit field list, never by spreading the row — a spread
 * would carry passwordHash into every response the day someone adds a field.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

@Service()
export class AuthService {
  constructor(
    @Autowired() private readonly users: UsersRepository,
    @Autowired() private readonly tokens: Tokens,
  ) {}

  async signup(dto: SignupDTO): Promise<{ user: PublicUser; token: string }> {
    if (await this.users.findByEmail(dto.email)) {
      throw HttpException.conflict('Email already registered')
    }

    const user = await this.users.create({
      email: dto.email,
      passwordHash: await hashPassword(dto.password),
      name: dto.name,
    })

    return { user: toPublicUser(user), token: await this.tokens.sign(user.id) }
  }

  async login(dto: LoginDTO): Promise<{ user: PublicUser; token: string }> {
    const user = await this.users.findByEmail(dto.email)

    // Hash a dummy value when the user is missing so an unknown email and a
    // wrong password take comparable time. Without this the response time
    // discloses which emails are registered.
    const stored = user?.passwordHash ?? (await hashPassword('timing-equaliser'))
    const ok = await verifyPassword(dto.password, stored)

    // Identical message either way — a distinct "no such user" would hand out
    // a user-enumeration oracle.
    if (!user || !ok) throw HttpException.unauthorized('Invalid email or password')

    return { user: toPublicUser(user), token: await this.tokens.sign(user.id) }
  }
}
