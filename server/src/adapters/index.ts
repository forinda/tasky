import { SwaggerAdapter } from '@forinda/kickjs-swagger'
import { DevToolsAdapter } from '@forinda/kickjs-devtools'
import { getEnv } from '@forinda/kickjs'
import { SqliteAdapter } from './sqlite.adapter'

const isProduction = getEnv('NODE_ENV') === 'production'

export const adapters = [
  // Persistence is required in every environment.
  SqliteAdapter(),
  // DevTools exposes the route table, DI graph, and adapter list with no
  // auth (`secret: false`). Never mount it in production.
  ...(isProduction ? [] : [DevToolsAdapter({ secret: false })]),
  // Swagger mounts /docs, /redoc, and /openapi.json — the full API surface
  // described in one place. Development only.
  ...(isProduction
    ? []
    : [
        SwaggerAdapter({
          info: {
            title: 'Adero API',
            description: 'Adero API',
            version: '1.0.0',
          },
        }),
      ]),
]
