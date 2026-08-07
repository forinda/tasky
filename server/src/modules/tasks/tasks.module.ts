import { defineModule } from '@forinda/kickjs'
import { CurrentUser } from '@/contributors/current-user.contributor'
import { TasksController } from './tasks.controller'

// `*.use-case.ts` is in the list because the operations now live there. The
// controller imports each one by value so DI would resolve them anyway, but a
// use case that is added and not yet wired to a route would otherwise never be
// registered — and HMR needs the glob to see the file to reload it gracefully.
import.meta.glob(
  [
    './**/*.controller.ts',
    './**/*.service.ts',
    './**/*.repository.ts',
    './**/*.use-case.ts',
    '!./**/*.test.ts',
  ],
  { eager: true },
)

export const TasksModule = defineModule({
  name: 'TasksModule',
  build: () => ({
    /**
     * Module-level, not per-method: a route added here later is protected by
     * default rather than protected only if someone remembers the decorator.
     */
    contributors() {
      return [CurrentUser.registration]
    },

    routes() {
      return { path: '/tasks', controller: TasksController }
    },
  }),
})
