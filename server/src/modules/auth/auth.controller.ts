import {
  Autowired,
  Controller,
  Get,
  Middleware,
  Post,
  rateLimitGuard,
  reply,
  type Ctx,
  type RateLimitStore,
} from '@forinda/kickjs'
import { ApiBearerAuth, ApiPublic, ApiTags } from '@forinda/kickjs-swagger'
import { CurrentUser } from '@/contributors/current-user.contributor'
import { AuthService } from './auth.service'
import { signupSchema } from './dtos/signup.dto'
import { loginSchema } from './dtos/login.dto'

/**
 * Counter backing the auth rate limit.
 *
 * Supplied explicitly rather than relying on the guard's implicit default so it
 * can be cleared between tests. `@Middleware(authLimit())` evaluates once at
 * class-definition time, so the guard — and therefore its counter — is shared
 * for the lifetime of the module; without a handle on it, one test's attempts
 * exhaust the quota for every test after it.
 *
 * ponytail: in-memory, single process. Two instances behind a load balancer
 * each allow the full quota. Swap in `KvRateLimitStore` before scaling out.
 */
class MemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, { count: number; resetTime: Date }>()

  async increment(key: string) {
    const now = Date.now()
    const existing = this.hits.get(key)

    if (!existing || existing.resetTime.getTime() <= now) {
      const fresh = { count: 1, resetTime: new Date(now + WINDOW_MS) }
      this.hits.set(key, fresh)
      return { totalHits: 1, resetTime: fresh.resetTime }
    }

    existing.count += 1
    return { totalHits: existing.count, resetTime: existing.resetTime }
  }

  async decrement(key: string) {
    const existing = this.hits.get(key)
    if (existing && existing.count > 0) existing.count -= 1
  }

  async reset(key: string) {
    this.hits.delete(key)
  }

  /** Test hook: the interface only resets one key at a time. */
  resetAll() {
    this.hits.clear()
  }
}

const WINDOW_MS = 60_000

export const authRateLimitStore = new MemoryRateLimitStore()

/**
 * scrypt makes each attempt costly, but nothing caps how many are made. Applied
 * to signup and login only — /auth/me is cheap and already needs a valid token.
 */
const authLimit = () =>
  rateLimitGuard({
    max: 10,
    windowMs: WINDOW_MS,
    store: authRateLimitStore,
    message: 'Too many attempts, please try again shortly',
    // Explicit key: the default falls back to 'global' when no forwarding
    // header is present, which would let one attacker throttle everyone.
    keyGenerator: (ctx) =>
      ctx.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
      ctx.headers['x-real-ip']?.toString() ??
      'unknown',
  })

@Controller()
export class AuthController {
  @Autowired() private readonly auth!: AuthService

  // Explicitly public rather than merely undecorated — absence of a security
  // decorator reads as an oversight, @ApiPublic() reads as a decision.
  @Post('/signup', { body: signupSchema, name: 'Signup' })
  @ApiTags('Auth')
  @ApiPublic()
  @Middleware(authLimit())
  async signup(ctx: Ctx) {
    return reply.created(await this.auth.signup(ctx.body))
  }

  @Post('/login', { body: loginSchema, name: 'Login' })
  @ApiTags('Auth')
  @ApiPublic()
  @Middleware(authLimit())
  async login(ctx: Ctx) {
    return this.auth.login(ctx.body)
  }

  // Applied per-method, not on the class: signup and login live on this same
  // controller and must stay reachable without a token.
  @Get('/me')
  @ApiTags('Auth')
  @ApiBearerAuth()
  @CurrentUser
  async me(ctx: Ctx) {
    return ctx.require('currentUser')
  }
}
