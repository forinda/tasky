// Side-effect import — registers the extended env schema with kickjs before
// any test resolves a value. Mirrors the ordering rule in src/index.ts.
// `.env.test` supplies DATABASE_URL=:memory:.
import './config'
