import { Container, HttpException } from '@forinda/kickjs'
import type { RequestContext } from '@forinda/kickjs'

/**
 * MyGuard guard.
 *
 * Guards protect routes by checking conditions before the handler runs.
 * Return early with an error response to block access.
 *
 * Usage:
 *   @Middleware(myGuardGuard)
 *   @Get('/protected')
 *   async handler(ctx: RequestContext) { ... }
 */
export async function myGuardGuard(ctx: RequestContext, next: () => void): Promise<void> {
  // Example: check for an authorization header
  const header = ctx.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    ctx.res.status(401).json({ message: 'Missing or invalid authorization header' })
    return
  }

  const token = header.slice(7)

  try {
    // Verify the token using a service from the DI container
    // const container = Container.getInstance()
    // const authService = container.resolve(AuthService)
    // const payload = authService.verifyToken(token)
    // ctx.set('auth', payload)

    next()
  } catch {
    ctx.res.status(401).json({ message: 'Invalid or expired token' })
  }
}
