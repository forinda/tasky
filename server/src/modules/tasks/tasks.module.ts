import { defineModule } from '@forinda/kickjs'
import { CurrentUser } from '@/contributors/current-user.contributor'
import { TasksController } from './tasks.controller'

import.meta.glob(
  ['./**/*.controller.ts', './**/*.service.ts', './**/*.repository.ts', '!./**/*.test.ts'],
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
