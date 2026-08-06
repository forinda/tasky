import 'reflect-metadata'
// Importing './config' first registers the extended env schema with kickjs
// **before** any controller / service / @Value gets resolved. Without this
// line ConfigService.get('YOUR_KEY') returns undefined because the cached
// schema would still be the base shape. The named `env` import still runs
// that side effect — position matters, not the import form.
import { env } from './config'
import { bootstrap, expressRuntime } from '@forinda/kickjs'
import { SwaggerAdapter } from '@forinda/kickjs-swagger'
import { DevToolsAdapter } from '@forinda/kickjs-devtools'
import { modules } from './modules'

const isProduction = env.NODE_ENV === 'production'

// Export the app for the Vite plugin (dev mode) and createTestApp.
export const app = await bootstrap({
  modules,
  runtime: expressRuntime(),
  adapters: [
    // DevTools exposes the route table, DI graph, and adapter list with no
    // auth (`secret: false`). Never mount it in production.
    ...(isProduction ? [] : [DevToolsAdapter({ secret: false })]),
    SwaggerAdapter({
      info: {
        title: 'Adero API',
        description: 'Adero API',
        version: '1.0.0',
      },
    }),
  ],
})
