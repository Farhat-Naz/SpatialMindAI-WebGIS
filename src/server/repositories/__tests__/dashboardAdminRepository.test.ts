import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { createDashboard } from "@/server/repositories/dashboardRepository"
import { addWidget } from "@/server/repositories/widgetRepository"
import { getUsageAnalytics, listAuditLog, listDashboardsForAdmin } from "@/server/repositories/dashboardAdminRepository"
import { TEST_COLLABORATOR_ID, TEST_OWNER_ID, ensureTestCollaborator, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

/** T325/T326 gap-fill — `dashboardAdminRepository.ts` (US10/Phase 16) has no entry in the original repository-api.md, but ships real Owner-gated business logic that deserves the same direct coverage every other repository gets. */
describe.skipIf(!dbAvailable)("dashboardAdminRepository", () => {
  let projectId: string
  let dashboardId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Admin Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })

    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: `Dash ${Date.now()}` })
    dashboardId = dashboard.id
    await addWidget(dashboardId, TEST_OWNER_ID, { type: "text", config: { content: "hi" } })
  }, 15000)

  it("listDashboardsForAdmin: T288 — rejects a non-Project-Owner (Editor) caller", async () => {
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" } })
    await expect(listDashboardsForAdmin(projectId, TEST_COLLABORATOR_ID)).rejects.toThrow()
  })

  it("listDashboardsForAdmin: T284 — returns owner/visibility/shareCount/widgets for a Project Owner", async () => {
    const rows = await listDashboardsForAdmin(projectId, TEST_OWNER_ID)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: dashboardId, ownerId: TEST_OWNER_ID, visibility: "private", shareCount: 0 })
    expect(rows[0].widgets).toHaveLength(1)
  })

  it("getUsageAnalytics: T285 — rejects a non-Owner and returns widget-type counts for an Owner", async () => {
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Viewer" } })
    await expect(getUsageAnalytics(projectId, TEST_COLLABORATOR_ID)).rejects.toThrow()

    const usage = await getUsageAnalytics(projectId, TEST_OWNER_ID)
    expect(usage.mostUsedWidgetTypes).toContainEqual({ type: "text", count: 1 })
  })

  it("listAuditLog: T286 — rejects a non-Owner and returns dashboard-related activity for an Owner", async () => {
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" } })
    await expect(listAuditLog(projectId, TEST_COLLABORATOR_ID)).rejects.toThrow()

    const { activities } = await listAuditLog(projectId, TEST_OWNER_ID)
    expect(activities.some((activity) => activity.targetType === "dashboard" && activity.action === "create")).toBe(true)
    expect(activities.some((activity) => activity.targetType === "widget" && activity.action === "create")).toBe(true)
    expect(activities.every((activity) => ["dashboard", "widget", "report"].includes(activity.targetType))).toBe(true)
  })
})
