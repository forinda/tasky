import { defineHttpContextDecorator } from '@forinda/kickjs'
import type { RequestContext } from '@forinda/kickjs'

/**
 * Authorize context contributor (http).
 *
 * Computes a value and writes it to `ctx.set('authorize', …)` before a
 * matched handler runs — the typed, ordered alternative to
 * `@Middleware()` when the only job is to populate `ctx`.
 *
 * Apply per method/class:
 *
 *   @Authorize({ name: … })
 *   @Get('/')
 *   handler(ctx: RequestContext) {
 *     return ctx.require('authorize')
 *   }
 *
 * Or register at a module / adapter / bootstrap site — those take a
 * `ContributorRegistration`, not the decorator itself:
 *
 *   bootstrap({ contributors: [Authorize.with({ name: … }).registration] })
 */

// Register 'authorize' so `ctx.require('authorize')` is typed and `dependsOn: ['authorize']`
// is checked. Replace `unknown` with the resolved value's real type.
// (For a key you only depend on — no value type needed — declare it in
// `interface ContextKeys` instead.)
declare module '@forinda/kickjs' {
  interface ContextMeta {
    'authorize': unknown
  }
}

export type AuthorizeParams = {
  name: string
  gender: 'male'|'female'
  isDone: boolean
}

export const Authorize = defineHttpContextDecorator.withParams<AuthorizeParams>()({
  key: 'authorize',
  // Every call site must supply these — no placeholder defaults.
  // Add `paramDefaults: { … }` for any field whose default is
  // genuinely correct for an undecorated route, and drop it from here.
  requiredParams: ['name', 'gender', 'isDone'],
  resolve: (ctx, _deps, params) => {
    // `params` is typed as AuthorizeParams (call-site params merged onto any paramDefaults).
    // TODO: compute and return the value written to ctx.set('authorize', …)
    throw new Error("Authorize contributor: resolve() not implemented")
  },
})
