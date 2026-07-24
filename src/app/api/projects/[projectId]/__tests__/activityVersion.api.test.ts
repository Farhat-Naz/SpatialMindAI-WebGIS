import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { GET as getActivity } from "../activity/route"
import { GET as listVersions, POST as saveVersion } from "../versions/route"
import { GET as getVersion } from "@/app/api/versions/[versionId]/route"
import { POST as restoreVersion } from "@/app/api/versions/[versionId]/restore/route"
import { GET as compareVersions } from "@/app/api/versions/compare/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Activity/Version API", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `ActivityVersion API Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Viewer" },
    })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L1", order: 0 } })
    layerId = layer.id
    await prismaClient.$queryRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layerId}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
    `
  })

  it("lists activity (empty is fine — read-only endpoint)", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const response = await getActivity(
      jsonRequest(`http://localhost/api/projects/${projectId}/activity`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.activities)).toBe(true)
  })

  it("a Viewer cannot save a version (403); an Editor (Owner here) can", async () => {
    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    const viewerAttempt = await saveVersion(
      jsonRequest(`http://localhost/api/projects/${projectId}/versions`, "POST", {}) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(viewerAttempt.status).toBe(403)

    process.env.DEV_USER_ID = TEST_OWNER_ID
    const ownerSave = await saveVersion(
      jsonRequest(`http://localhost/api/projects/${projectId}/versions`, "POST", { note: "v1" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(ownerSave.status).toBe(201)
  })

  it("SC-007: restore never results in fewer versions than existed before it", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const saveResponse = await saveVersion(
      jsonRequest(`http://localhost/api/projects/${projectId}/versions`, "POST", { note: "v1" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { version: v1 } = await saveResponse.json()

    const beforeList = await listVersions(
      jsonRequest(`http://localhost/api/projects/${projectId}/versions`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { versions: versionsBefore } = await beforeList.json()

    const restoreResponse = await restoreVersion(
      jsonRequest(`http://localhost/api/versions/${v1.id}/restore`, "POST") as never,
      { params: Promise.resolve({ versionId: v1.id }) },
    )
    expect(restoreResponse.status).toBe(201)

    const afterList = await listVersions(
      jsonRequest(`http://localhost/api/projects/${projectId}/versions`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { versions: versionsAfter } = await afterList.json()
    expect(versionsAfter.length).toBeGreaterThan(versionsBefore.length)
  })

  it("returns version detail with snapshot, and compares two versions", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const v1Response = await saveVersion(
      jsonRequest(`http://localhost/api/projects/${projectId}/versions`, "POST", { note: "v1" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { version: v1 } = await v1Response.json()

    await prismaClient.$queryRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layerId}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[9,9]}'), NOW(), NOW())
    `

    const v2Response = await saveVersion(
      jsonRequest(`http://localhost/api/projects/${projectId}/versions`, "POST", { note: "v2" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { version: v2 } = await v2Response.json()

    const detailResponse = await getVersion(
      jsonRequest(`http://localhost/api/versions/${v1.id}`, "GET") as never,
      { params: Promise.resolve({ versionId: v1.id }) },
    )
    expect(detailResponse.status).toBe(200)
    const { version: detail } = await detailResponse.json()
    expect(detail.snapshot).toBeDefined()

    const compareResponse = await compareVersions(
      jsonRequest(`http://localhost/api/versions/compare?a=${v1.id}&b=${v2.id}`, "GET") as never,
    )
    expect(compareResponse.status).toBe(200)
    const { diff } = await compareResponse.json()
    expect(diff.addedFeatureIds).toHaveLength(1)
  })
})
