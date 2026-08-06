import type { Request, Response, NextFunction } from 'express'

export interface MdWareOptions {
  // Add configuration options here. The factory below closes over the
  // resolved options object; pass them at the call site —
  // `mdWare({ foo: 'bar' })` — and the closure preserves them across
  // every request.
}

/**
 * MdWare middleware.
 *
 * Usage in bootstrap (fires on every request):
 *   middleware: [mdWare()]
 *
 * Usage with adapter — phase controls *when* the handler runs:
 *
 *   middleware() {
 *     return [{ handler: mdWare(), phase: 'afterGlobal' }]
 *   }
 *
 * Phase semantics (see `MiddlewarePhase` JSDoc for the full contract):
 *   - 'beforeGlobal' / 'afterGlobal' / 'beforeRoutes' — fire on every
 *     request, before module routes run.
 *   - 'afterRoutes' — fires ONLY when no route matched (404 fall-through)
 *     OR a route handler called `next()` without ending the response.
 *     Controllers that call `ctx.json(…)` end the chain and skip this
 *     phase. For per-response work (logging, metrics) attach to
 *     `res.on('finish', …)` from an earlier-phase middleware instead.
 *
 * Optional path scope — string, RegExp, or array of either:
 *   middleware() {
 *     return [{
 *       handler: mdWare({ region: 'eu' }),
 *       phase: 'afterGlobal',
 *       path: ['/api', /^\/admin/],
 *     }]
 *   }
 *
 * Usage with @Middleware decorator:
 *   @Middleware(mdWare())
 */
export function mdWare(options: MdWareOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Implement your middleware logic here. `options` is captured by
    // closure — log or read it anywhere in this handler body.
    void options
    next()
  }
}
