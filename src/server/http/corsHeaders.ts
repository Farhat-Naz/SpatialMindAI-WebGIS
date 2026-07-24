import { getAllowedOrigins } from "@/server/config/env"

/**
 * Builds CORS response headers for a request from `origin`, restricted to
 * the `ALLOWED_ORIGINS` allow-list (FR-043). Returns `null` for a
 * disallowed (or unset) origin — the caller should omit CORS headers
 * entirely in that case, not send a permissive default. Fail-closed: an
 * unset `ALLOWED_ORIGINS` allows nothing (T244).
 */
export function buildCorsHeaders(origin: string | null): Record<string, string> | null {
  if (!origin) {
    return null
  }
  const allowedOrigins = getAllowedOrigins()
  if (!allowedOrigins.includes(origin)) {
    return null
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  }
}
