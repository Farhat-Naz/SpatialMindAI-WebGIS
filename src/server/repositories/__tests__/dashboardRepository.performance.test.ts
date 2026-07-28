import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { listDashboardsForProject } from "@/server/repositories/dashboardRepository"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

const DASHBOARD_COUNT = 100
/** Documented rather than tight (same rationale as `analysisRepository.performance.test.ts`) — this runs against whatever hardware CI/a laptop provides. The point is "cursor pagination keeps this bounded regardless of project size" (SC-003/T302), not a precise benchmark. */
const RESPONSE_BUDGET_MS = 2_000

/** T313 — a 100-dashboard project: `listDashboardsForProject`'s response time must stay bounded (SC-003), confirming cursor pagination (T302) rather than a full-project scan/render is what the list view actually does. */
describe.skipIf(!dbAvailable)("dashboardRepository performance — 100-dashboard project", () => {
  let projectId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Performance Test ${Date.now()}` },
    })
    projectId = project.id

    await prismaClient.dashboard.createMany({
      data: Array.from({ length: DASHBOARD_COUNT }, (_, index) => ({
        projectId,
        ownerId: TEST_OWNER_ID,
        name: `Dashboard ${index}`,
      })),
    })
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("the fixture really has 100 dashboards", async () => {
    const count = await prismaClient.dashboard.count({ where: { projectId } })
    expect(count).toBe(DASHBOARD_COUNT)
  })

  it("returns one bounded page (never the whole 100-row project) within the time budget", async () => {
    const startedAt = Date.now()
    const { dashboards, nextCursor } = await listDashboardsForProject(projectId, TEST_OWNER_ID)
    const durationMs = Date.now() - startedAt

    expect(durationMs).toBeLessThan(RESPONSE_BUDGET_MS)
    expect(dashboards.length).toBeLessThan(DASHBOARD_COUNT)
    expect(nextCursor).not.toBeNull()
  })

  it("cursor pagination walks the full 100-dashboard set in bounded pages, none of which is a full scan", async () => {
    let cursor: string | undefined
    let total = 0
    let pages = 0

    for (;;) {
      const startedAt = Date.now()
      const page = await listDashboardsForProject(projectId, TEST_OWNER_ID, { cursor })
      expect(Date.now() - startedAt).toBeLessThan(RESPONSE_BUDGET_MS)

      total += page.dashboards.length
      pages += 1
      if (!page.nextCursor) break
      cursor = page.nextCursor
      // Guards against an infinite loop if pagination ever regressed to non-advancing.
      if (pages > DASHBOARD_COUNT) throw new Error("Pagination did not terminate.")
    }

    expect(total).toBe(DASHBOARD_COUNT)
    expect(pages).toBeGreaterThan(1)
  })
})
