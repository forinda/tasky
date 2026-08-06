import { Autowired, Controller, Get, Post, reply, type Ctx } from '@forinda/kickjs'
import { ApiTags } from '@forinda/kickjs-swagger'
import { CurrentUser } from '../../contributors/current-user.contributor'
import { AuthService } from './auth.service'
import { signupSchema } from './dtos/signup.dto'
import { loginSchema } from './dtos/login.dto'

@Controller()
export class AuthController {
  @Autowired() private readonly auth!: AuthService

  @Post('/signup', { body: signupSchema, name: 'Signup' })
  @ApiTags('Auth')
  async signup(ctx: Ctx) {
    return reply.created(await this.auth.signup(ctx.body))
  }

  @Post('/login', { body: loginSchema, name: 'Login' })
  @ApiTags('Auth')
  async login(ctx: Ctx) {
    return this.auth.login(ctx.body)
  }

  // Applied per-method, not on the class: signup and login live on this same
  // controller and must stay reachable without a token.
  @Get('/me')
  @ApiTags('Auth')
  @CurrentUser
  async me(ctx: Ctx) {
    return ctx.require('currentUser')
  }
}
