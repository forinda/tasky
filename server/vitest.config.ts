import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import swc from 'unplugin-swc'

export default defineConfig({
  plugins: [swc.vite()],
  // Mirrors vite.config.ts and tsconfig.json's `paths`. Without it `@/` type
  // checks but fails to resolve at test runtime, which is why the alias was
  // unusable in tests until now.
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
