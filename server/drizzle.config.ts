import { defineConfig } from 'drizzle-kit'

// Build-time CLI config — NOT application code. drizzle-kit runs this in its
// own process before the app (and therefore the env schema) has loaded, so
// reading process.env directly here is correct; `getEnv` is unavailable.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './data/adero.db',
  },
})
