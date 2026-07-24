import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "./testHelpers"
import { acceptInvitation, createInvitation, declineInvitation } from "../invitationRepository"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("invitationRepository", () => {
  let projectId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Invitation Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_OWNER_ID, role: "Owner" },
    })
  })

  it("creates a pending invitation", async () => {
    const invitation = await createInvitation(projectId, TEST_OWNER_ID, TEST_COLLABORATOR_ID, "Editor")
    expect(invitation).not.toBeNull()
    expect(invitation?.status).toBe("pending")
    expect(invitation?.role).toBe("Editor")
  })

  it("returns the existing pending invitation as a no-op on a duplicate invite (Edge Cases)", async () => {
    const first = await createInvitation(projectId, TEST_OWNER_ID, TEST_COLLABORATOR_ID, "Editor")
    const second = await createInvitation(projectId, TEST_OWNER_ID, TEST_COLLABORATOR_ID, "Viewer")

    expect(second?.id).toBe(first?.id)
    expect(second?.role).toBe("Editor")

    const count = await prismaClient.invitation.count({ where: { projectId } })
    expect(count).toBe(1)
  })

  it("returns null when the target user is already a member", async () => {
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" },
    })

    const invitation = await createInvitation(projectId, TEST_OWNER_ID, TEST_COLLABORATOR_ID, "Editor")
    expect(invitation).toBeNull()
  })

  it("accepting creates membership, an Activity row, and notifies the inviter", async () => {
    const invitation = await createInvitation(projectId, TEST_OWNER_ID, TEST_COLLABORATOR_ID, "Editor")

    const accepted = await acceptInvitation(invitation!.id, TEST_COLLABORATOR_ID)
    expect(accepted.status).toBe("accepted")

    const membership = await prismaClient.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: TEST_COLLABORATOR_ID } },
    })
    expect(membership?.role).toBe("Editor")

    const activity = await prismaClient.activity.findFirst({
      where: { projectId, action: "share", targetType: "invitation", targetId: invitation!.id },
    })
    expect(activity).not.toBeNull()

    const notification = await prismaClient.notification.findFirst({
      where: { recipientUserId: TEST_OWNER_ID, type: "invitation_accepted" },
    })
    expect(notification).not.toBeNull()
  })

  it("declining marks the invitation declined without creating membership", async () => {
    const invitation = await createInvitation(projectId, TEST_OWNER_ID, TEST_COLLABORATOR_ID, "Viewer")

    const declined = await declineInvitation(invitation!.id, TEST_COLLABORATOR_ID)
    expect(declined.status).toBe("declined")

    const membership = await prismaClient.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: TEST_COLLABORATOR_ID } },
    })
    expect(membership).toBeNull()
  })
})
