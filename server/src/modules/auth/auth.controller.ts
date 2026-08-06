import { Autowired, Controller, Get, Post, reply, type Ctx } from '@forinda/kickjs'
import { ApiBearerAuth, ApiPublic, ApiTags } from '@forinda/kickjs-swagger'
import { CurrentUser } from '../../contributors/current-user.contributor'
import { AuthService } from './auth.service'
import { signupSchema } from './dtos/signup.dto'
import { loginSchema } from './dtos/login.dto'

@Controller()
export class AuthController {
  @Autowired() private readonly auth!: AuthService

  // Explicitly public rather than merely undecorated — absence of a security
  // decorator reads as an oversight, @ApiPublic() reads as a decision.
  @Post('/signup', { body: signupSchema, name: 'Signup' })
  @ApiTags('Auth')
  @ApiPublic()
  async signup(ctx: Ctx) {
    return reply.created(await this.auth.signup(ctx.body))
  }

  @Post('/login', { body: loginSchema, name: 'Login' })
  @ApiTags('Auth')
  @ApiPublic()
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
