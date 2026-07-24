import { describe, expect, it } from "vitest"
import { toErrorResponse, type ApiErrorCode } from "../apiError"

describe("toErrorResponse", () => {
  const cases: Array<[ApiErrorCode, number]> = [
    ["INVALID_INPUT", 400],
    ["NOT_FOUND", 404],
    ["DUPLICATE_NAME", 409],
    ["UNAUTHORIZED", 401],
    ["DATABASE_ERROR", 500],
  ]

  it.each(cases)("maps %s to HTTP %i", (code, expectedStatus) => {
    const { status, body } = toErrorResponse(code, "message")
    expect(status).toBe(expectedStatus)
    expect(body).toEqual({ error: { code, message: "message" } })
  })
})
