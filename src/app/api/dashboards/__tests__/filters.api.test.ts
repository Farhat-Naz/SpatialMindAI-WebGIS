import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { POST as CREATE_DASHBOARD } from "@/app/api/projects/[projectId]/dashboards/route"
import { GET as LIST_FILTERS, POST as CREATE_FILTER } from "@/app/api/dashboards/[dashboardId]/filters/route"
import { DELETE as DELETE_FILTER } from "@/app/api/filters/[filterId]/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Dashboard Filters API", () => {
  let projectId: string
  let dashboardId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({ data: { ownerId: TEST_OWNER_ID, name: `Filters API ${Date.now()}` } })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })

    const created = await CREATE_DASHBOARD(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "Filtered Dash" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    dashboardId = (await created.json()).dashboard.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("POST creates a global date filter, GET lists it", async () => {
    const created = await CREATE_FILTER(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/filters`, "POST", {
        filterType: "date",
        config: { from: "2026-01-01T00:00:00.000Z" },
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect(created.status).toBe(201)

    const listed = await LIST_FILTERS(new Request(`http://localhost/api/dashboards/${dashboardId}/filters`) as never, {
      params: Promise.resolve({ dashboardId }),
    })
    expect(listed.status).toBe(200)
    expect((await listed.json()).filters.length).toBeGreaterThan(0)
  })

  it("DELETE removes a filter", async () => {
    const created = await CREATE_FILTER(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/filters`, "POST", {
        filterType: "layer",
        config: { layerIds: ["some-layer-id"] },
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    const { filter } = await created.json()

    const deleted = await DELETE_FILTER(jsonRequest(`http://localhost/api/filters/${filter.id}`, "DELETE") as never, {
      params: Promise.resolve({ filterId: filter.id }),
    })
    expect(deleted.status).toBe(204)
  })

  it("POST rejects a malformed config with 400 INVALID_INPUT", async () => {
    const response = await CREATE_FILTER(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/filters`, "POST", {
        filterType: "attribute",
        config: { key: "status" },
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect(response.status).toBe(400)
  })
})
