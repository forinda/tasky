/**
 * Users Module
 *
 * REST module with a flat folder structure.
 * Controller delegates to service, service wraps the repository.
 *
 * Structure:
 *   users.controller.ts  — HTTP routes (CRUD)
 *   users.service.ts     — Business logic
 *   users.repository.ts  — Repository interface
 *   in-memory-users.repository.ts — Repository implementation
 *   dtos/                   — Request/response schemas
 */
import { defineModule } from '@forinda/kickjs'
import { USERS_REPOSITORY } from './users.repository'
import { InMemoryUsersRepository } from './in-memory-users.repository'
import { UsersController } from './users.controller'

// Eagerly load decorated classes so @Controller()/@Service()/@Repository() decorators
// register in the DI container. Recursive globs (./**/) so the module keeps working
// however you nest files (e.g. moving controllers into a controllers/ sub-folder).
import.meta.glob(
  ['./**/*.controller.ts', './**/*.service.ts', './**/*.repository.ts', '!./**/*.test.ts'],
  { eager: true },
)

export const UsersModule = defineModule({
  name: 'UsersModule',
  build: () => ({
    register(container) {
      container.registerFactory(USERS_REPOSITORY, () =>
        container.resolve(InMemoryUsersRepository),
      )
    },

    /**
     * Declare HTTP routes for this module. Return value shape:
     *
     *   - `path`        — URL prefix for this route set.
     *   - `controller`  — Controller class (also drives OpenAPI).
     *   - `version`     — Optional. Overrides the app-wide API version.
     *
     * Return an **array** to mount multiple route sets — admin
     * surfaces, side-by-side v1 + v2 controllers, etc:
     *
     *   return [
     *     { path: '/users', version: 1, controller: UsersV1Controller },
     *     { path: '/users', version: 2, controller: UsersV2Controller },
     *   ]
     */
    routes() {
      return {
        path: '/users',
        controller: UsersController,
      }
    },

  }),
})
