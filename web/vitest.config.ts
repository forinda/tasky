import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

/**
 * Separate from vite.config.ts rather than folded into it.
 *
 * The dev config carries a `server.proxy` pointing at :3000. Tests must never
 * reach a real API — a suite that quietly passes because a dev server happened
 * to be running, and fails on a machine where it is not, is worse than no
 * suite. MSW intercepts every request here, and anything it does not recognise
 * throws.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Each file gets a fresh module registry, so the in-memory access token in
    // lib/token.ts cannot leak a session from one test file into another.
    isolate: true,
    css: true,
  },
})
