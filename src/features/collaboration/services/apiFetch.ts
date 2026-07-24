import type { ApiError } from "@/shared/errors/apiError"

/**
 * Shared `fetch` wrapper for this feature's services: sets JSON headers,
 * parses the `{ error: { code, message } }` envelope on failure, and returns
 * `undefined` for a `204 No Content` response. Contains no business logic
 * beyond request shaping/response parsing (Constitution Principle I). A
 * thin, feature-owned copy of `database`'s identical helper — not exported
 * from that feature's public barrel, so re-implemented here rather than
 * reached into across the feature boundary.
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
    throw new Error(error?.message ?? `Request failed with status ${response.status}`)
  }

  return body as T
}
