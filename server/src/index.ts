import 'reflect-metadata'
// Side-effect import — registers the extended env schema with kickjs
// **before** any controller / service / @Value gets resolved. Without
// this line ConfigService.get('YOUR_KEY') returns undefined because the
// cached schema would still be the base shape.
import './config'
import { bootstrap, expressRuntime } from '@forinda/kickjs'
import { adapters } from './adapters'
import { modules } from './modules'

// Export the app for the Vite plugin (dev mode) and createTestApp.
export const app = await bootstrap({
  modules,
  runtime: expressRuntime(),
  adapters,
})
