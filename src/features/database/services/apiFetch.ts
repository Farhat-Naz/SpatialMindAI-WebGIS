import type { ApiError } from "@/shared/errors/apiError"
import { ApiRequestError } from "@/shared/errors/apiRequestError"

/**
 * Shared `fetch` wrapper for this feature's services: sets JSON headers,
 * parses the `{ error: { code, message } }` envelope on failure, and returns
 * `undefined` for a `204 No Content` response. Contains no business logic
 * beyond request shaping/response parsing (Constitution Principle I).
 *
 * The thrown failure is an `ApiRequestError`, which carries the envelope's
 * `code` and the HTTP status in addition to the message. That is an **additive**
 * change made by specs/005-import-export (T082): the import pipeline's chunk
 * retry must distinguish a permanent `CONFLICT` from a transient
 * `RATE_LIMITED`, and string-matching a user-facing message is not a sound way
 * to do it. `ApiRequestError extends Error` with the same message, so callers
 * that only read `error.message` are unaffected.
 */
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })

  if (response.status === 204) {
    return undefined as T
  }

  const body: unknown = await response.json()

  if (!response.ok) {
    const error = (body as { error?: ApiError }).error
    throw new ApiRequestError(
      error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.code ?? null,
    )
  }

  return body as T
}
