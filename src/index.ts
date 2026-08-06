import 'reflect-metadata'
// Side-effect import — registers the extended env schema with kickjs
// **before** any controller / service / @Value gets resolved. Without
// this line ConfigService.get('YOUR_KEY') returns undefined because the
// cached schema would still be the base shape. See guide/configuration.
import './config'
import { bootstrap, expressRuntime } from '@forinda/kickjs'
import { SwaggerAdapter } from '@forinda/kickjs-swagger'
import { DevToolsAdapter } from '@forinda/kickjs-devtools'
import { modules } from './modules'
import { mdWare } from './middleware/md-ware.middleware'

// Export the app for the Vite plugin (dev mode)
export const app = await bootstrap({
  modules,
  runtime: expressRuntime(),
  adapters: [
    DevToolsAdapter({secret:false}),
    SwaggerAdapter({
      info: {
        title: 'Adero API',
        description: 'Adero API',
        version: '1.0.0',
      },
    }),
  ],
  middlewares: [mdWare()],
})
