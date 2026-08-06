import { defineModule } from '@forinda/kickjs'
import { CurrentUser } from '../../contributors/current-user.contributor'
import { CategoriesController } from './categories.controller'

import.meta.glob(
  ['./**/*.controller.ts', './**/*.service.ts', './**/*.repository.ts', '!./**/*.test.ts'],
  { eager: true },
)

export const CategoriesModule = defineModule({
  name: 'CategoriesModule',
  build: () => ({
    /**
     * Module-level, not per-method. Every route on this module requires a
     * token, so making it structural means a route added later is protected by
     * default. The failure mode of per-method registration is forgetting the
     * decorator on exactly one handler — which no test notices unless someone
     * thought to write it. There is one here that does.
     */
    contributors() {
      return [CurrentUser.registration]
    },

    routes() {
      return { path: '/categories', controller: CategoriesController }
    },
  }),
})
