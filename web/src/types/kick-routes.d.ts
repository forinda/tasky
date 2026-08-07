// Type-only bridge to the server's generated route types. The import is erased
// at build time — no server code enters the web bundle. Regenerate with
// `kick typegen` in server/ (automatic under `kick dev`).
//
// This is what makes `api.get('/tasks/grouped')` typecheck and
// `api.get('/nope')` fail to compile.
import '../../../server/.kickjs/types/kick__routes'
