import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "./testHelpers"
import {
  createComment,
  deleteComment,
  listCommentsForFeature,
  resolveComment,
  updateComment,
} from "../commentRepository"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("commentRepository", () => {
  let projectId: string
  let featureId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Comment Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" },
    })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L1", order: 0 } })
    const rows = await prismaClient.$queryRaw<{ id: string }[]>`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layer.id}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
      RETURNING id
    `
    featureId = rows[0].id
  })

  it("creates a top-level comment", async () => {
    const comment = await createComment(featureId, TEST_OWNER_ID, "Looks good to me.")
    expect(comment.body).toBe("Looks good to me.")
    expect(comment.resolved).toBe(false)
    expect(comment.parentCommentId).toBeNull()
  })

  it("creates a threaded reply", async () => {
    const root = await createComment(featureId, TEST_OWNER_ID, "Question about this parcel.")
    const reply = await createComment(featureId, TEST_COLLABORATOR_ID, "Answering here.", root.id)

    expect(reply.parentCommentId).toBe(root.id)
    const all = await listCommentsForFeature(featureId)
    expect(all).toHaveLength(2)
  })

  it("parses @mentions and notifies the mentioned project member", async () => {
    const collaboratorLocalPart = `${TEST_COLLABORATOR_ID}@dev.local`.split("@")[0]
    const comment = await createComment(featureId, TEST_OWNER_ID, `Hey @${collaboratorLocalPart}, check this out`)

    expect(comment.mentionedUserIds).toContain(TEST_COLLABORATOR_ID)

    const notification = await prismaClient.notification.findFirst({
      where: { recipientUserId: TEST_COLLABORATOR_ID, type: "mention" },
    })
    expect(notification).not.toBeNull()
  })

  it("only the author may edit a comment's body", async () => {
    const comment = await createComment(featureId, TEST_OWNER_ID, "Original text")

    await expect(
      updateComment(comment.id, TEST_COLLABORATOR_ID, { body: "Hijacked" }),
    ).rejects.toThrow()

    const updated = await updateComment(comment.id, TEST_OWNER_ID, { body: "Edited by author" })
    expect(updated.body).toBe("Edited by author")
  })

  it("resolving toggles resolved without deleting the comment or its replies", async () => {
    const root = await createComment(featureId, TEST_OWNER_ID, "Root")
    await createComment(featureId, TEST_COLLABORATOR_ID, "Reply", root.id)

    const resolved = await resolveComment(root.id, true)
    expect(resolved.resolved).toBe(true)

    const all = await listCommentsForFeature(featureId)
    expect(all).toHaveLength(2)
  })

  it("only the author may delete a comment; deleting a root cascades to replies", async () => {
    const root = await createComment(featureId, TEST_OWNER_ID, "Root")
    await createComment(featureId, TEST_COLLABORATOR_ID, "Reply", root.id)

    await expect(deleteComment(root.id, TEST_COLLABORATOR_ID)).rejects.toThrow()

    await deleteComment(root.id, TEST_OWNER_ID)
    const remaining = await listCommentsForFeature(featureId)
    expect(remaining).toHaveLength(0)
  })
})
