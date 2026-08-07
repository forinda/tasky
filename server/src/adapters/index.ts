import { SwaggerAdapter } from '@forinda/kickjs-swagger'
import { DevToolsAdapter } from '@forinda/kickjs-devtools'
import { SpaAdapter, getEnv } from '@forinda/kickjs'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { SqliteAdapter } from './sqlite.adapter'

const isProduction = getEnv('NODE_ENV') === 'production'

/**
 * `import.meta.dirname` is `server/src/adapters` unbundled and `server/dist`
 * once built, so the depth to web/dist differs. Same trap the migrations path
 * hit in Story 2 — check both rather than assuming one.
 */
const CLIENT_CANDIDATES = [
  resolve(import.meta.dirname, '../../web/dist'), // bundled: server/dist -> web/dist
  resolve(import.meta.dirname, '../../../web/dist'), // unbundled: server/src/adapters
]
const CLIENT_DIR = CLIENT_CANDIDATES.find((path) => existsSync(path)) ?? CLIENT_CANDIDATES[0]

export const adapters = [
  // Persistence is required in every environment.
  SqliteAdapter(),
  // Serves the built SPA. Production only: in development Vite serves it and
  // proxies here, and web/dist may not exist at all.
  //
  // A CLASS, not a factory — `new`, unlike every other adapter in this file.
  // The published guide at kickjs.app/guide/spa.html shows a factory call;
  // that is wrong for 6.7.0 and throws "Class constructor SpaAdapter cannot be
  // invoked without 'new'". Verified at runtime.
  ...(isProduction
    ? [
        new SpaAdapter({
          clientDir: CLIENT_DIR,
          // Without these the SPA fallback returns index.html with a 200 for
          // every mistyped API path and for the docs surfaces — a genuinely
          // miserable failure to debug.
          apiPrefix: '/api',
          exclude: ['/docs', '/redoc', '/openapi.json', '/_debug'],
        }),
      ]
    : []),
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
