import { Autowired, Controller, Post, reply, type Ctx } from '@forinda/kickjs'
import { ApiTags } from '@forinda/kickjs-swagger'
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
}
