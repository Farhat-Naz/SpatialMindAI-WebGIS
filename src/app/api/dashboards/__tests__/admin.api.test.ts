import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { POST as CREATE_DASHBOARD } from "@/app/api/projects/[projectId]/dashboards/route"
import { GET as GET_ADMIN_OVERVIEW } from "@/app/api/projects/[projectId]/dashboards/admin/route"
import { GET as GET_AUDIT_LOG } from "@/app/api/projects/[projectId]/dashboards/admin/audit/route"
import { POST as LOG_EXPORT } from "@/app/api/dashboards/[dashboardId]/export-log/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

/** T327/T328 gap-fill — Dashboard Administration (US10/T284–T288/T295) has no dedicated API test file; added here to close the gap the coverage audit found. */
describe.skipIf(!dbAvailable)("Dashboard Administration API", () => {
  let projectId: string
  let dashboardId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({ data: { ownerId: TEST_OWNER_ID, name: `Admin API ${Date.now()}` } })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })

    const created = await CREATE_DASHBOARD(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "Admin Dash" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    dashboardId = (await created.json()).dashboard.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("GET /admin: 200 with dashboards + usage for the Project Owner", async () => {
    const response = await GET_ADMIN_OVERVIEW(new Request(`http://localhost/api/projects/${projectId}/dashboards/admin`) as never, {
      params: Promise.resolve({ projectId }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.dashboards).toHaveLength(1)
    expect(body.dashboards[0]).toHaveProperty("shareCount")
    expect(body.usage).toHaveProperty("mostUsedWidgetTypes")
  })

  it("GET /admin/audit: 200 with dashboard-related activity for the Project Owner", async () => {
    const response = await GET_AUDIT_LOG(new Request(`http://localhost/api/projects/${projectId}/dashboards/admin/audit`) as never, {
      params: Promise.resolve({ projectId }),
    })
    expect(response.status).toBe(200)
    const { activities } = await response.json()
    expect(activities.length).toBeGreaterThan(0)
    expect(activities.every((activity: { targetType: string }) => ["dashboard", "widget", "report"].includes(activity.targetType))).toBe(
      true,
    )
  })

  it("T288 — GET /admin: 403 FORBIDDEN for a non-Owner (Editor) caller", async () => {
    await prismaClient.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: TEST_COLLABORATOR_ID } },
      update: { role: "Editor" },
      create: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" },
    })
    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    try {
      const response = await GET_ADMIN_OVERVIEW(
        new Request(`http://localhost/api/projects/${projectId}/dashboards/admin`) as never,
        { params: Promise.resolve({ projectId }) },
      )
      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.error.code).toBe("FORBIDDEN")
    } finally {
      process.env.DEV_USER_ID = TEST_OWNER_ID
    }
  })

  it("T288 — GET /admin/audit: 403 FORBIDDEN for a non-Owner (Editor) caller", async () => {
    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    try {
      const response = await GET_AUDIT_LOG(
        new Request(`http://localhost/api/projects/${projectId}/dashboards/admin/audit`) as never,
        { params: Promise.resolve({ projectId }) },
      )
      expect(response.status).toBe(403)
    } finally {
      process.env.DEV_USER_ID = TEST_OWNER_ID
    }
  })

  it("T340 — POST export-log records an export activity whose metadata reflects the active filter at export time", async () => {
    const filters = [{ filterType: "date", config: { from: "2026-01-01T00:00:00.000Z" } }]
    const logged = await LOG_EXPORT(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/export-log`, "POST", { format: "csv", filters }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect(logged.status).toBe(204)

    const auditResponse = await GET_AUDIT_LOG(
      new Request(`http://localhost/api/projects/${projectId}/dashboards/admin/audit`) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { activities } = await auditResponse.json()
    const exportActivity = activities.find(
      (activity: { action: string; targetType: string }) => activity.action === "export" && activity.targetType === "dashboard",
    )
    expect(exportActivity).toBeTruthy()
    expect(exportActivity.metadata).toEqual({ format: "csv", filters })
  })
})
