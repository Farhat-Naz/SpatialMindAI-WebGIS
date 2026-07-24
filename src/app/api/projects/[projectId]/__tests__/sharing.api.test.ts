import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { GET, POST } from "../invitations/route"
import { POST as accept } from "@/app/api/invitations/[invitationId]/accept/route"
import { POST as decline } from "@/app/api/invitations/[invitationId]/decline/route"
import { GET as listMembers } from "../members/route"
import { DELETE as removeMember, PATCH as changeRole } from "../members/[userId]/route"
import { POST as transferOwnership } from "../transfer-ownership/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Sharing/Membership API", () => {
  let projectId: string

  beforeEach(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Sharing API Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
  })

  it("Owner can invite a member; non-Owner cannot (403)", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const ownerResponse = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/invitations`, "POST", {
        invitedUserId: TEST_COLLABORATOR_ID,
        role: "Editor",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(ownerResponse.status).toBe(201)
    const { invitation } = await ownerResponse.json()

    // Accept so TEST_COLLABORATOR_ID becomes a (non-Owner) member.
    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    await accept(
      jsonRequest(`http://localhost/api/invitations/${invitation.id}/accept`, "POST") as never,
      { params: Promise.resolve({ invitationId: invitation.id }) },
    )

    const strangerInviteId = "test-third-user-1"
    await prismaClient.user.upsert({
      where: { id: strangerInviteId },
      update: {},
      create: { id: strangerInviteId, email: `${strangerInviteId}@dev.local` },
    })

    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    const editorAttempt = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/invitations`, "POST", {
        invitedUserId: strangerInviteId,
        role: "Viewer",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(editorAttempt.status).toBe(403)
  })

  it("returns the same invitation on a duplicate invite (no error, no duplicate)", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const first = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/invitations`, "POST", {
        invitedUserId: TEST_COLLABORATOR_ID,
        role: "Editor",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const second = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/invitations`, "POST", {
        invitedUserId: TEST_COLLABORATOR_ID,
        role: "Viewer",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const firstBody = await first.json()
    const secondBody = await second.json()
    expect(secondBody.invitation.id).toBe(firstBody.invitation.id)
  })

  it("rejects a malformed invite body with 400", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/invitations`, "POST", {
        invitedUserId: "",
        role: "Owner",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)
  })

  it("a non-member cannot list invitations (404)", async () => {
    process.env.DEV_USER_ID = "test-nonmember-1"
    await prismaClient.user.upsert({
      where: { id: "test-nonmember-1" },
      update: {},
      create: { id: "test-nonmember-1", email: "test-nonmember-1@dev.local" },
    })
    const response = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/invitations`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(404)
  })

  it("only the invited user may accept or decline (non-disclosing 404 otherwise)", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const inviteResponse = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/invitations`, "POST", {
        invitedUserId: TEST_COLLABORATOR_ID,
        role: "Editor",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { invitation } = await inviteResponse.json()

    process.env.DEV_USER_ID = TEST_OWNER_ID
    const wrongUserAccept = await accept(
      jsonRequest(`http://localhost/api/invitations/${invitation.id}/accept`, "POST") as never,
      { params: Promise.resolve({ invitationId: invitation.id }) },
    )
    expect(wrongUserAccept.status).toBe(404)

    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    const declined = await decline(
      jsonRequest(`http://localhost/api/invitations/${invitation.id}/decline`, "POST") as never,
      { params: Promise.resolve({ invitationId: invitation.id }) },
    )
    expect(declined.status).toBe(200)
  })

  it("Owner can change a member's role and remove them; non-Owner cannot (403)", async () => {
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" },
    })

    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    const forbidden = await changeRole(
      jsonRequest(`http://localhost/api/projects/${projectId}/members/${TEST_COLLABORATOR_ID}`, "PATCH", {
        role: "Viewer",
      }) as never,
      { params: Promise.resolve({ projectId, userId: TEST_COLLABORATOR_ID }) },
    )
    expect(forbidden.status).toBe(403)

    process.env.DEV_USER_ID = TEST_OWNER_ID
    const changed = await changeRole(
      jsonRequest(`http://localhost/api/projects/${projectId}/members/${TEST_COLLABORATOR_ID}`, "PATCH", {
        role: "Viewer",
      }) as never,
      { params: Promise.resolve({ projectId, userId: TEST_COLLABORATOR_ID }) },
    )
    expect(changed.status).toBe(200)

    const removed = await removeMember(
      jsonRequest(`http://localhost/api/projects/${projectId}/members/${TEST_COLLABORATOR_ID}`, "DELETE") as never,
      { params: Promise.resolve({ projectId, userId: TEST_COLLABORATOR_ID }) },
    )
    expect(removed.status).toBe(204)

    const membersResponse = await listMembers(
      jsonRequest(`http://localhost/api/projects/${projectId}/members`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { members } = await membersResponse.json()
    expect(members.map((m: { userId: string }) => m.userId)).not.toContain(TEST_COLLABORATOR_ID)
  })

  it("Editor attempting ownership transfer gets 403 (US1 scenario 6)", async () => {
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" },
    })

    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    const response = await transferOwnership(
      jsonRequest(`http://localhost/api/projects/${projectId}/transfer-ownership`, "POST", {
        newOwnerUserId: TEST_COLLABORATOR_ID,
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(403)
  })
})
