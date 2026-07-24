import { describe, expect, it, vi } from "vitest"
import { isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import {
  checkApiHealth,
  checkApplicationHealth,
  checkDatabaseHealth,
  overallStatus,
} from "../healthChecker"

const dbAvailable = await isDatabaseAvailable()

describe("checkApplicationHealth", () => {
  it("always reports healthy (a running process, by definition)", () => {
    expect(checkApplicationHealth()).toEqual({ status: "healthy", latencyMs: 0 })
  })
})

describe("checkApiHealth", () => {
  it("always reports healthy", () => {
    expect(checkApiHealth()).toEqual({ status: "healthy", latencyMs: 0 })
  })
})

describe("checkDatabaseHealth", () => {
  describe.skipIf(!dbAvailable)("against the real ephemeral PostGIS test database", () => {
    it("returns healthy with the PostGIS extension detected", async () => {
      const result = await checkDatabaseHealth()

      expect(result.status).toBe("healthy")
      expect(result.latencyMs).not.toBeNull()
    })
  })

  it("returns unhealthy when the query rejects", async () => {
    vi.resetModules()
    vi.doMock("@/server/db/prismaClient", () => ({
      prismaClient: {
        $queryRaw: vi.fn().mockRejectedValue(new Error("connection refused")),
      },
    }))

    const { checkDatabaseHealth: checkDatabaseHealthMocked } = await import("../healthChecker")
    const result = await checkDatabaseHealthMocked()

    expect(result.status).toBe("unhealthy")
    expect(result.detail).toContain("connection refused")

    vi.doUnmock("@/server/db/prismaClient")
    vi.resetModules()
  })
})

describe("overallStatus", () => {
  it("returns healthy when all three components are healthy", () => {
    expect(
      overallStatus({
        application: { status: "healthy", latencyMs: 0 },
        database: { status: "healthy", latencyMs: 5 },
        api: { status: "healthy", latencyMs: 0 },
      }),
    ).toBe("healthy")
  })

  it("returns unhealthy if any component is unhealthy, even if others are healthy", () => {
    expect(
      overallStatus({
        application: { status: "healthy", latencyMs: 0 },
        database: { status: "unhealthy", latencyMs: 5 },
        api: { status: "healthy", latencyMs: 0 },
      }),
    ).toBe("unhealthy")
  })

  it("returns degraded if the worst component is degraded and none are unhealthy", () => {
    expect(
      overallStatus({
        application: { status: "healthy", latencyMs: 0 },
        database: { status: "degraded", latencyMs: 5 },
        api: { status: "healthy", latencyMs: 0 },
      }),
    ).toBe("degraded")
  })
})
