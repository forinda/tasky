import { defineModule } from '@forinda/kickjs'
import { AuthController } from './auth.controller'

// Eagerly load decorated classes so @Controller/@Service register in the DI
// container. Recursive globs so nesting keeps working. `tokens.ts` is included
// explicitly — it holds a @Service() but matches none of the suffix patterns.
// `auth.queries.ts` is deliberately absent: plain functions, nothing to bind.
import.meta.glob(
  [
    './**/*.controller.ts',
    './**/*.use-case.ts',
    './**/tokens.ts',
    '!./**/*.test.ts',
  ],
  { eager: true },
)

export const AuthModule = defineModule({
  name: 'AuthModule',
  build: () => ({
    // No register() hook — every dependency is a concrete class resolved by
    // type, so there is nothing to bind.
    routes() {
      return { path: '/auth', controller: AuthController }
    },
  }),
})
