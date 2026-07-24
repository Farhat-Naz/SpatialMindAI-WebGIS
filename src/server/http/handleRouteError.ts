import { NextResponse } from "next/server"
import {
  ConflictError,
  DuplicateNameError,
  ForbiddenError,
  MaintenanceActiveError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
  toErrorResponse,
} from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

/**
 * Maps a thrown repository/auth error (or any unexpected exception) to the
 * shared `{ error: { code, message } }` envelope and matching HTTP status
 * (Research Decision 10). Every Route Handler in this feature funnels its
 * catch block through this one function so error mapping stays uniform.
 * Unrecognized errors are logged and reported as a generic `DATABASE_ERROR`
 * — never a leaked stack trace.
 */
export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    const { status, body } = toErrorResponse("INVALID_INPUT", error.message)
    return NextResponse.json(body, { status })
  }
  if (error instanceof NotFoundError) {
    const { status, body } = toErrorResponse("NOT_FOUND", error.message)
    return NextResponse.json(body, { status })
  }
  if (error instanceof DuplicateNameError) {
    const { status, body } = toErrorResponse("DUPLICATE_NAME", error.message)
    return NextResponse.json(body, { status })
  }
  if (error instanceof UnauthorizedError) {
    const { status, body } = toErrorResponse("UNAUTHORIZED", error.message)
    return NextResponse.json(body, { status })
  }
  if (error instanceof RateLimitedError) {
    const { status, body } = toErrorResponse("RATE_LIMITED", error.message)
    return NextResponse.json(body, { status })
  }
  if (error instanceof ForbiddenError) {
    const { status, body } = toErrorResponse("FORBIDDEN", error.message)
    return NextResponse.json(body, { status })
  }
  if (error instanceof MaintenanceActiveError) {
    const { status, body } = toErrorResponse("MAINTENANCE_ACTIVE", error.message)
    return NextResponse.json(body, { status })
  }
  if (error instanceof ConflictError) {
    const { status, body } = toErrorResponse("CONFLICT", error.message)
    return NextResponse.json(body, { status })
  }

  logger.error("Unhandled Route Handler error", {
    message: error instanceof Error ? error.message : String(error),
  })
  const { status, body } = toErrorResponse(
    "DATABASE_ERROR",
    "An unexpected error occurred.",
  )
  return NextResponse.json(body, { status })
}
