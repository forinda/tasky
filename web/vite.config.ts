import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// Overridable because server/.env is gitignored and machine-local: if someone
// runs the API on another port, a hardcoded target here fails as ECONNREFUSED
// behind a proxy, which reads as "the API is broken" rather than "wrong port".
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Runtime half of the tsconfig `paths` mapping. Only web's own src needs an
  // alias at runtime — the server half is type-only and erased.
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    // Fail rather than slide to 5174. A moved port still "works" — the proxy
    // follows — so nothing breaks visibly, and you end up with two dev servers
    // running while you debug the wrong one. Loud beats convenient.
    strictPort: true,
    // The client's baseUrl is the relative '/api/v1', so the browser hits Vite
    // and Vite forwards to the KickJS server. Same-origin in dev, same-origin
    // in production (SpaAdapter serves both) — which is why this project has
    // no CORS configuration anywhere.
    // `changeOrigin: false` keeps the browser's Host (localhost:5173) on the
    // forwarded request. The API's CSRF check compares Origin against Host, and
    // rewriting Host to the target makes every same-origin request look
    // cross-origin — /auth/refresh answered 403 for the whole dev session.
    // Production proxies are expected to preserve Host the same way
    // (nginx: `proxy_set_header Host $host`).
    proxy: { '/api': { target: API_TARGET, changeOrigin: false } },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
})
