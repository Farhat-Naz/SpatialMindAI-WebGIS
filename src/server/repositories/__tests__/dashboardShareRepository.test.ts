import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { createDashboard } from "@/server/repositories/dashboardRepository"
import { grantShare, listShares, resolveEffectivePermission, revokeShare } from "@/server/repositories/dashboardShareRepository"
import { TEST_COLLABORATOR_ID, TEST_OWNER_ID, ensureTestCollaborator, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("dashboardShareRepository", () => {
  let projectId: string
  let dashboardId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Share Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: `Dash ${Date.now()}` })
    dashboardId = dashboard.id
  }, 15000)

  it("resolveEffectivePermission: null for a user with no project role, no share, on a private dashboard", async () => {
    const permission = await resolveEffectivePermission(dashboardId, TEST_COLLABORATOR_ID)
    expect(permission).toBeNull()
  })

  it("resolveEffectivePermission: a share broadens access beyond the base project role", async () => {
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Viewer" } })
    await grantShare(dashboardId, TEST_OWNER_ID, { userId: TEST_COLLABORATOR_ID, permission: "edit" })

    const permission = await resolveEffectivePermission(dashboardId, TEST_COLLABORATOR_ID)
    expect(permission).toBe("edit")
  })

  it("resolveEffectivePermission: a share never narrows access below the base project role", async () => {
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" } })
    await grantShare(dashboardId, TEST_OWNER_ID, { userId: TEST_COLLABORATOR_ID, permission: "view" })

    const permission = await resolveEffectivePermission(dashboardId, TEST_COLLABORATOR_ID)
    expect(permission).toBe("edit")
  })

  it("resolveEffectivePermission: view for any signed-in user on a public dashboard, even with no project role", async () => {
    await prismaClient.dashboard.update({ where: { id: dashboardId }, data: { visibility: "public" } })
    const permission = await resolveEffectivePermission(dashboardId, TEST_COLLABORATOR_ID)
    expect(permission).toBe("view")
  })

  it("grantShare: rejected for a non-owner, non-project-Owner caller", async () => {
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" } })
    await expect(
      grantShare(dashboardId, TEST_COLLABORATOR_ID, { userId: TEST_COLLABORATOR_ID, permission: "edit" }),
    ).rejects.toThrow()
  })

  it("revokeShare: removes the grant", async () => {
    await grantShare(dashboardId, TEST_OWNER_ID, { userId: TEST_COLLABORATOR_ID, permission: "view" })
    await revokeShare(dashboardId, TEST_OWNER_ID, TEST_COLLABORATOR_ID)

    const shares = await listShares(dashboardId, TEST_OWNER_ID)
    expect(shares).toHaveLength(0)
  })
})
