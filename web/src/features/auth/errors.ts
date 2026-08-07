/**
 * The server's error bodies, as they actually are.
 *
 * Verified against a live response rather than assumed: validation failures
 * come back `422 { message, errors: [{ field, message }] }`, and a rejected
 * login comes back `401 { message }`. The plan for this story guessed an RFC
 * 9457 envelope with per-field detail; it is simpler than that.
 */
interface FieldIssue {
  field?: unknown
  message?: unknown
}

interface ErrorBody {
  message?: unknown
  errors?: unknown
}

export interface ParsedAuthError {
  /** Keyed by field name, for rendering under the input it belongs to. */
  fields: Record<string, string>
  /** Everything with no field of its own — shown above the form. */
  form: string | null
}

function bodyOf(error: unknown): ErrorBody | null {
  const body = (error as { body?: unknown } | null)?.body
  return body && typeof body === 'object' ? (body as ErrorBody) : null
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

const FALLBACK = 'Something went wrong. Try again.'

export function parseAuthError(error: unknown): ParsedAuthError {
  const status = statusOf(error)
  const body = bodyOf(error)

  const fields: Record<string, string> = {}
  if (Array.isArray(body?.errors)) {
    for (const issue of body.errors as FieldIssue[]) {
      if (typeof issue?.field === 'string' && typeof issue?.message === 'string') {
        // First one wins: a field with two failures shows the first, and a
        // stack of messages under one input is noise.
        fields[issue.field] ??= issue.message
      }
    }
  }

  // A 422 whose messages are all attached to fields needs no form-level line —
  // repeating "Invalid email address" above an input that already says it is
  // the interface talking twice.
  if (status === 422 && Object.keys(fields).length > 0) {
    return { fields, form: null }
  }

  const message = typeof body?.message === 'string' ? body.message : null

  // Network failure: `fetch` rejects rather than resolving, so there is no
  // status and no body. Saying "check your connection" is a guess; saying what
  // to do is not.
  if (status === null) return { fields, form: 'Could not reach the server. Try again.' }

  return { fields, form: message ?? FALLBACK }
}
