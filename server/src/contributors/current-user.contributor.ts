import { HttpException, defineHttpContextDecorator } from '@forinda/kickjs'
import { UsersRepository } from '../modules/auth/users.repository'
import { Tokens } from '../modules/auth/tokens'
import { toPublicUser, type PublicUser } from '../modules/auth/auth.service'

// Registers the key so `ctx.require('currentUser')` is typed.
declare module '@forinda/kickjs' {
  interface ContextMeta {
    currentUser: PublicUser
  }
}

/**
 * Authenticates AND provides. A contributor whose `resolve` throws forwards to
 * the request error handler (there is no `optional: true` here), so this single
 * piece replaces a separate guard — which is also what the project's deny-list
 * prescribes: a middleware whose only output is `ctx.set()` should be a
 * contributor instead.
 *
 * Apply per method or per module on protected surfaces. It is deliberately NOT
 * global: signup and login must stay reachable without a token.
 */
export const CurrentUser = defineHttpContextDecorator({
  key: 'currentUser',
  deps: { tokens: Tokens, users: UsersRepository },
  resolve: async (ctx, { tokens, users }) => {
    const header = ctx.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      throw HttpException.unauthorized('Missing or malformed Authorization header')
    }

    const subject = await tokens.verify(header.slice('Bearer '.length))
    if (!subject) throw HttpException.unauthorized('Invalid or expired token')

    // A token can outlive its user. Treat a deleted account as unauthenticated
    // rather than letting a valid signature imply a valid user.
    const user = await users.findById(subject)
    if (!user) throw HttpException.unauthorized('Invalid or expired token')

    return toPublicUser(user)
  },
})
