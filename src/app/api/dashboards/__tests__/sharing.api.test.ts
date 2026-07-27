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
import { GET as LIST_SHARES, POST as GRANT_SHARE } from "@/app/api/dashboards/[dashboardId]/shares/route"
import { DELETE as REVOKE_SHARE } from "@/app/api/dashboards/[dashboardId]/shares/[userId]/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Dashboard Sharing API", () => {
  let projectId: string
  let dashboardId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({ data: { ownerId: TEST_OWNER_ID, name: `Sharing API ${Date.now()}` } })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })

    const created = await CREATE_DASHBOARD(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "Shared Dash" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    dashboardId = (await created.json()).dashboard.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("POST grants a share, GET lists it", async () => {
    const granted = await GRANT_SHARE(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/shares`, "POST", {
        userId: TEST_COLLABORATOR_ID,
        permission: "view",
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect(granted.status).toBe(201)

    const listed = await LIST_SHARES(new Request(`http://localhost/api/dashboards/${dashboardId}/shares`) as never, {
      params: Promise.resolve({ dashboardId }),
    })
    expect(listed.status).toBe(200)
    const { shares } = await listed.json()
    expect(shares.map((s: { userId: string }) => s.userId)).toContain(TEST_COLLABORATOR_ID)
  })

  it("DELETE revokes a share, effective on the next request", async () => {
    await GRANT_SHARE(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/shares`, "POST", {
        userId: TEST_COLLABORATOR_ID,
        permission: "edit",
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )

    const revoked = await REVOKE_SHARE(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/shares/${TEST_COLLABORATOR_ID}`, "DELETE") as never,
      { params: Promise.resolve({ dashboardId, userId: TEST_COLLABORATOR_ID }) },
    )
    expect(revoked.status).toBe(204)

    const listed = await LIST_SHARES(new Request(`http://localhost/api/dashboards/${dashboardId}/shares`) as never, {
      params: Promise.resolve({ dashboardId }),
    })
    const { shares } = await listed.json()
    expect(shares.map((s: { userId: string }) => s.userId)).not.toContain(TEST_COLLABORATOR_ID)
  })

  it("POST returns 403 FORBIDDEN for a non-owner, non-project-Owner caller", async () => {
    await prismaClient.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: TEST_COLLABORATOR_ID } },
      update: { role: "Editor" },
      create: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" },
    })
    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    try {
      const response = await GRANT_SHARE(
        jsonRequest(`http://localhost/api/dashboards/${dashboardId}/shares`, "POST", {
          userId: TEST_COLLABORATOR_ID,
          permission: "view",
        }) as never,
        { params: Promise.resolve({ dashboardId }) },
      )
      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.error.code).toBe("FORBIDDEN")
    } finally {
      process.env.DEV_USER_ID = TEST_OWNER_ID
    }
  })
})
