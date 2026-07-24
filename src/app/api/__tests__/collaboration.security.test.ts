import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { GET as listInvitations, POST as invite } from "@/app/api/projects/[projectId]/invitations/route"
import { GET as listMembers } from "@/app/api/projects/[projectId]/members/route"
import { PATCH as changeRole } from "@/app/api/projects/[projectId]/members/[userId]/route"
import { POST as transferOwnership } from "@/app/api/projects/[projectId]/transfer-ownership/route"
import { GET as listComments, POST as postComment } from "@/app/api/features/[featureId]/comments/route"
import { GET as getActivity } from "@/app/api/projects/[projectId]/activity/route"
import { GET as listVersions, POST as saveVersion } from "@/app/api/projects/[projectId]/versions/route"
import { POST as acquireLock } from "@/app/api/features/[featureId]/lock/route"
import { POST as heartbeat } from "@/app/api/projects/[projectId]/presence/heartbeat/route"
import { GET as getPresence } from "@/app/api/projects/[projectId]/presence/route"
import { GET as stream } from "@/app/api/projects/[projectId]/stream/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

/**
 * Consolidated sweep (T070): every project/feature-scoped endpoint from
 * T044–T064, tested once for a genuine non-member — must be `404` (never
 * disclosing the resource's existence), matching this codebase's
 * established non-disclosure pattern. Role-insufficient (`403`) cases for
 * each endpoint are covered individually in sharing.api.test.ts,
 * comments.api.test.ts, and activityVersion.api.test.ts — not repeated
 * here to avoid duplicating the same assertions in two files.
 */
describe.skipIf(!dbAvailable)("Collaboration security sweep: non-member 404s", () => {
  let projectId: string
  let featureId: string
  const strangerId = "test-security-stranger-1"

  beforeEach(async () => {
    await ensureTestOwner()
    process.env.DEV_USER_ID = strangerId
    await prismaClient.user.upsert({
      where: { id: strangerId },
      update: {},
      create: { id: strangerId, email: `${strangerId}@dev.local` },
    })

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Security Sweep ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L1", order: 0 } })
    const rows = await prismaClient.$queryRaw<{ id: string }[]>`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layer.id}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
      RETURNING id
    `
    featureId = rows[0].id
  })

  it("GET invitations → 404", async () => {
    const r = await listInvitations(jsonRequest(`http://localhost/api/projects/${projectId}/invitations`, "GET") as never, { params: Promise.resolve({ projectId }) })
    expect(r.status).toBe(404)
  })

  it("POST invitations → 404", async () => {
    const r = await invite(jsonRequest(`http://localhost/api/projects/${projectId}/invitations`, "POST", { invitedUserId: strangerId, role: "Editor" }) as never, { params: Promise.resolve({ projectId }) })
    expect(r.status).toBe(404)
  })

  it("GET members → 404", async () => {
    const r = await listMembers(jsonRequest(`http://localhost/api/projects/${projectId}/members`, "GET") as never, { params: Promise.resolve({ projectId }) })
    expect(r.status).toBe(404)
  })

  it("PATCH member role → 404", async () => {
    const r = await changeRole(jsonRequest(`http://localhost/api/projects/${projectId}/members/${TEST_OWNER_ID}`, "PATCH", { role: "Viewer" }) as never, { params: Promise.resolve({ projectId, userId: TEST_OWNER_ID }) })
    expect(r.status).toBe(404)
  })

  it("POST transfer-ownership → 404", async () => {
    const r = await transferOwnership(jsonRequest(`http://localhost/api/projects/${projectId}/transfer-ownership`, "POST", { newOwnerUserId: strangerId }) as never, { params: Promise.resolve({ projectId }) })
    expect(r.status).toBe(404)
  })

  it("GET comments → 404", async () => {
    const r = await listComments(jsonRequest(`http://localhost/api/features/${featureId}/comments`, "GET") as never, { params: Promise.resolve({ featureId }) })
    expect(r.status).toBe(404)
  })

  it("POST comments → 404", async () => {
    const r = await postComment(jsonRequest(`http://localhost/api/features/${featureId}/comments`, "POST", { body: "hi" }) as never, { params: Promise.resolve({ featureId }) })
    expect(r.status).toBe(404)
  })

  it("GET activity → 404", async () => {
    const r = await getActivity(jsonRequest(`http://localhost/api/projects/${projectId}/activity`, "GET") as never, { params: Promise.resolve({ projectId }) })
    expect(r.status).toBe(404)
  })

  it("GET/POST versions → 404", async () => {
    const list = await listVersions(jsonRequest(`http://localhost/api/projects/${projectId}/versions`, "GET") as never, { params: Promise.resolve({ projectId }) })
    expect(list.status).toBe(404)
    const save = await saveVersion(jsonRequest(`http://localhost/api/projects/${projectId}/versions`, "POST", {}) as never, { params: Promise.resolve({ projectId }) })
    expect(save.status).toBe(404)
  })

  it("POST lock → 404", async () => {
    const r = await acquireLock(jsonRequest(`http://localhost/api/features/${featureId}/lock`, "POST") as never, { params: Promise.resolve({ featureId }) })
    expect(r.status).toBe(404)
  })

  it("POST presence heartbeat → 404", async () => {
    const r = await heartbeat(jsonRequest(`http://localhost/api/projects/${projectId}/presence/heartbeat`, "POST", {}) as never, { params: Promise.resolve({ projectId }) })
    expect(r.status).toBe(404)
  })

  it("GET presence → 404", async () => {
    const r = await getPresence(jsonRequest(`http://localhost/api/projects/${projectId}/presence`, "GET") as never, { params: Promise.resolve({ projectId }) })
    expect(r.status).toBe(404)
  })

  it("GET stream → 404", async () => {
    const r = await stream(jsonRequest(`http://localhost/api/projects/${projectId}/stream`, "GET") as never, { params: Promise.resolve({ projectId }) })
    expect(r.status).toBe(404)
  })
})
