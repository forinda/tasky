import type { Request, Response } from 'express'

/**
 * The framework default returns `{"message":"Not Found"}` as application/json,
 * which diverges from every handler-raised error (those go through
 * `ctx.problem.*` / HttpException and emit RFC 9457). One status, two shapes —
 * and the typed client parses `KickClientError.body` as problem details, so the
 * routing 404 is the one it cannot read. This makes them agree.
 *
 * Takes raw Express arguments, matching `bootstrap({ onNotFound })`. That is
 * engine coupling: fine while `kick.config.ts` pins `runtime: 'express'`, but
 * it is the piece that breaks if the runtime ever moves to Fastify or h3.
 */
export function notFoundProblem(req: Request, res: Response): void {
  res.status(404)
  res.setHeader('Content-Type', 'application/problem+json')
  res.json({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: `No route matches ${req.method} ${req.originalUrl}`,
  })
}
