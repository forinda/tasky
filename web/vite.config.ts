import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Overridable because server/.env is gitignored and machine-local: if someone
// runs the API on another port, a hardcoded target here fails as ECONNREFUSED
// behind a proxy, which reads as "the API is broken" rather than "wrong port".
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The client's baseUrl is the relative '/api/v1', so the browser hits Vite
    // and Vite forwards to the KickJS server. Same-origin in dev, same-origin
    // in production (SpaAdapter serves both) — which is why this project has
    // no CORS configuration anywhere.
    proxy: { '/api': API_TARGET },
  },
})
