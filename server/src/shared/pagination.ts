import { parseQuery, type Ctx, type PaginatedResponse, type QueryFieldConfig } from '@forinda/kickjs'

/**
 * Pagination that keeps its type.
 *
 * `ctx.paginate` is declared `Promise<RuntimeResponse>` — it erases the payload,
 * so every paginated route reached `kick typegen` as an opaque blob and the
 * client could not see `.data` at all. The workaround was
 * `as unknown as PaginatedResponse<T>` on each controller: three casts asserting
 * a shape the compiler had been told to forget, which is exactly the kind of
 * claim that stays true only until someone changes the envelope.
 *
 * This does the same job and returns the real type, so nothing has to be cast
 * and `typegen` publishes an honest shape to the client.
 *
 * The parsing itself is still kickjs's `parseQuery` — the filter/sort/search
 * allow-list logic is not worth reimplementing and the field config is the
 * same. Only the envelope is ours, because the envelope is the part that was
 * being thrown away.
 */
export async function paginate<T, TConfig extends QueryFieldConfig | undefined = undefined>(
  ctx: Ctx,
  fetcher: (parsed: ReturnType<typeof parseQuery<TConfig>>) => Promise<{ data: T[]; total: number }>,
  fieldConfig?: TConfig,
): Promise<PaginatedResponse<T>> {
  const parsed = parseQuery(ctx.query as Record<string, unknown>, fieldConfig)
  const { data, total } = await fetcher(parsed)

  const { page, limit } = parsed.pagination
  // `limit` of 0 would divide by zero and report Infinity pages. The parser
  // clamps it above zero today; computing it defensively costs nothing and this
  // number is rendered straight into a UI.
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  }
}
