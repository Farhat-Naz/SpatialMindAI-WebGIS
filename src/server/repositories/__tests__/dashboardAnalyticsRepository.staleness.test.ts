import { describe, expect, it } from "vitest"
import { ANALYTICS_SNAPSHOT_TTL_MS } from "@/features/dashboards/types/dashboardConfig.constants"
import { isSnapshotStale } from "../dashboardAnalyticsRepository"

describe("isSnapshotStale", () => {
  const now = new Date("2026-07-28T12:00:00.000Z")

  it("is not stale immediately after computing", () => {
    expect(isSnapshotStale(now, now)).toBe(false)
  })

  it("is not stale just under the TTL", () => {
    const computedAt = new Date(now.getTime() - (ANALYTICS_SNAPSHOT_TTL_MS - 1))
    expect(isSnapshotStale(computedAt, now)).toBe(false)
  })

  it("is stale just over the TTL", () => {
    const computedAt = new Date(now.getTime() - (ANALYTICS_SNAPSHOT_TTL_MS + 1))
    expect(isSnapshotStale(computedAt, now)).toBe(true)
  })
})
