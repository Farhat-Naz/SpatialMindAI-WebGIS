import type { ApiErrorCode } from "./apiError"

/**
 * The client-side counterpart to `apiError.ts`'s server-side error classes:
 * what `apiFetch` throws when a Route Handler returns a non-2xx response,
 * carrying the `{ error: { code, message } }` envelope's `code` and the HTTP
 * status alongside the human-readable message.
 *
 * Added by specs/005-import-export (T082) because the import pipeline's chunk
 * retry has to *branch* on the failure category, not merely report it: a
 * `CONFLICT` means the job was cancelled or is already terminal and retrying
 * is pointless and wrong, while a `RATE_LIMITED` is transient and the right
 * response is to back off and try the same chunk again. A bare
 * `Error(message)` cannot express that difference without string-matching a
 * user-facing message, which would silently break the moment the wording
 * changed.
 *
 * Deliberately a **new module** rather than an addition to `apiError.ts`:
 * that file is the server's error vocabulary and this feature must not modify
 * it (research.md Decision 19 — no new `ApiErrorCode` is introduced, and none
 * is here; this class only *carries* one of the existing nine).
 *
 * `extends Error` with the message unchanged, so every existing caller that
 * only reads `error.message` — which, at the time of writing, is all of them —
 * behaves exactly as before.
 */
export class ApiRequestError extends Error {
  /** The envelope's `code`, or null when the response body was not a recognizable envelope. */
  readonly code: ApiErrorCode | null

  /** The HTTP status, retained for the cases where no envelope was returned at all. */
  readonly status: number

  constructor(message: string, status: number, code: ApiErrorCode | null = null) {
    super(message)
    this.name = "ApiRequestError"
    this.status = status
    this.code = code
  }
}

/** Narrows an unknown caught value to an `ApiRequestError`. */
export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError
}
