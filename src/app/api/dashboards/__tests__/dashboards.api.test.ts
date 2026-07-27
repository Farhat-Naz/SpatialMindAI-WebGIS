import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { GET, POST } from "@/app/api/projects/[projectId]/dashboards/route"
import { DELETE, GET as GET_ONE, PATCH } from "@/app/api/dashboards/[dashboardId]/route"
import { POST as DUPLICATE } from "@/app/api/dashboards/[dashboardId]/duplicate/route"
import { DELETE as UNFAVORITE, POST as FAVORITE } from "@/app/api/dashboards/[dashboardId]/favorite/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Dashboards API", () => {
  let projectId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({ data: { ownerId: TEST_OWNER_ID, name: `Dashboards API ${Date.now()}` } })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("POST creates a dashboard, GET lists it", async () => {
    const createResponse = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "Ops" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(createResponse.status).toBe(201)
    const { dashboard } = await createResponse.json()
    expect(dashboard.name).toBe("Ops")

    const listResponse = await GET(new Request(`http://localhost/api/projects/${projectId}/dashboards`) as never, {
      params: Promise.resolve({ projectId }),
    })
    expect(listResponse.status).toBe(200)
    const { dashboards } = await listResponse.json()
    expect(dashboards.map((d: { id: string }) => d.id)).toContain(dashboard.id)
  })

  it("POST rejects an empty name with 400 INVALID_INPUT", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe("INVALID_INPUT")
  })

  it("POST returns 409 DUPLICATE_NAME on a name collision", async () => {
    await POST(jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "DupName" }) as never, {
      params: Promise.resolve({ projectId }),
    })
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "DupName" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error.code).toBe("DUPLICATE_NAME")
  })

  it("GET one, PATCH renames, DELETE removes", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "Lifecycle" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { dashboard } = await created.json()

    const getResponse = await GET_ONE(new Request(`http://localhost/api/dashboards/${dashboard.id}`) as never, {
      params: Promise.resolve({ dashboardId: dashboard.id }),
    })
    expect(getResponse.status).toBe(200)

    const patchResponse = await PATCH(
      jsonRequest(`http://localhost/api/dashboards/${dashboard.id}`, "PATCH", { name: "Renamed" }) as never,
      { params: Promise.resolve({ dashboardId: dashboard.id }) },
    )
    expect(patchResponse.status).toBe(200)
    expect((await patchResponse.json()).dashboard.name).toBe("Renamed")

    const deleteResponse = await DELETE(
      jsonRequest(`http://localhost/api/dashboards/${dashboard.id}`, "DELETE") as never,
      { params: Promise.resolve({ dashboardId: dashboard.id }) },
    )
    expect(deleteResponse.status).toBe(204)

    const afterDelete = await GET_ONE(new Request(`http://localhost/api/dashboards/${dashboard.id}`) as never, {
      params: Promise.resolve({ dashboardId: dashboard.id }),
    })
    expect(afterDelete.status).toBe(404)
  })

  it("POST /duplicate produces a fully independent new dashboard", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "ToDuplicate" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { dashboard } = await created.json()

    const duplicated = await DUPLICATE(
      jsonRequest(`http://localhost/api/dashboards/${dashboard.id}/duplicate`, "POST") as never,
      { params: Promise.resolve({ dashboardId: dashboard.id }) },
    )
    expect(duplicated.status).toBe(201)
    const { dashboard: copy } = await duplicated.json()
    expect(copy.id).not.toBe(dashboard.id)
  })

  it("POST/DELETE /favorite is idempotent", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "Favable" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { dashboard } = await created.json()

    const first = await FAVORITE(jsonRequest(`http://localhost/api/dashboards/${dashboard.id}/favorite`, "POST") as never, {
      params: Promise.resolve({ dashboardId: dashboard.id }),
    })
    const second = await FAVORITE(jsonRequest(`http://localhost/api/dashboards/${dashboard.id}/favorite`, "POST") as never, {
      params: Promise.resolve({ dashboardId: dashboard.id }),
    })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const unfav = await UNFAVORITE(jsonRequest(`http://localhost/api/dashboards/${dashboard.id}/favorite`, "DELETE") as never, {
      params: Promise.resolve({ dashboardId: dashboard.id }),
    })
    expect(unfav.status).toBe(200)
  })

  it("GET /:dashboardId returns 404 for a nonexistent dashboard (non-disclosure)", async () => {
    const response = await GET_ONE(new Request("http://localhost/api/dashboards/nonexistent-id") as never, {
      params: Promise.resolve({ dashboardId: "nonexistent-id" }),
    })
    expect(response.status).toBe(404)
  })
})
