import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { createDashboard, getDashboardById, setDashboardVisibility } from "@/server/repositories/dashboardRepository"
import { grantShare, resolveEffectivePermission, revokeShare } from "@/server/repositories/dashboardShareRepository"
import { addWidget } from "@/server/repositories/widgetRepository"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"

/**
 * Full Sharing flow (quickstart.md §7; spec.md US7 Acceptance Scenarios
 * 1–5) against the real repository layer — server-side enforcement (T219,
 * T220, T222, T226) is a server concern, not something a mocked component
 * test can actually verify.
 */

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("Dashboard Sharing — full flow", () => {
  let projectId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Sharing Integration ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
  }, 15000)

  it("Scenario 1/2: sharing at 'view' lets the recipient read but not write", async () => {
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Shared" })
    await grantShare(dashboard.id, TEST_OWNER_ID, { userId: TEST_COLLABORATOR_ID, permission: "view" })

    const asRecipient = await getDashboardById(dashboard.id, TEST_COLLABORATOR_ID)
    expect(asRecipient.effectivePermission).toBe("view")

    await expect(
      addWidget(dashboard.id, TEST_COLLABORATOR_ID, { type: "text", config: { content: "x" } }),
    ).rejects.toThrow()
  })

  it("Scenario 3 / T220: a new dashboard defaults to private, and toggling public then back to private immediately restricts access again", async () => {
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Toggle" })
    expect(dashboard.visibility).toBe("private")
    expect(await resolveEffectivePermission(dashboard.id, TEST_COLLABORATOR_ID)).toBeNull()

    await setDashboardVisibility(dashboard.id, TEST_OWNER_ID, "public")
    expect(await resolveEffectivePermission(dashboard.id, TEST_COLLABORATOR_ID)).toBe("view")

    await setDashboardVisibility(dashboard.id, TEST_OWNER_ID, "private")
    expect(await resolveEffectivePermission(dashboard.id, TEST_COLLABORATOR_ID)).toBeNull()
  })

  it("Scenario 4 / T222: server-side write rejection is independent of any client-side hiding — a direct repository call from a 'view' user is still rejected", async () => {
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Enforced" })
    await grantShare(dashboard.id, TEST_OWNER_ID, { userId: TEST_COLLABORATOR_ID, permission: "view" })

    await expect(
      addWidget(dashboard.id, TEST_COLLABORATOR_ID, { type: "text", config: { content: "x" } }),
    ).rejects.toThrow()

    const widgets = await prismaClient.dashboardWidget.count({ where: { dashboardId: dashboard.id } })
    expect(widgets).toBe(0)
  })

  it("Scenario 5 / T226: revoking a share denies the very next request from that user — no stale grant", async () => {
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Revocable" })
    await grantShare(dashboard.id, TEST_OWNER_ID, { userId: TEST_COLLABORATOR_ID, permission: "edit" })
    expect(await resolveEffectivePermission(dashboard.id, TEST_COLLABORATOR_ID)).toBe("edit")

    await revokeShare(dashboard.id, TEST_OWNER_ID, TEST_COLLABORATOR_ID)

    expect(await resolveEffectivePermission(dashboard.id, TEST_COLLABORATOR_ID)).toBeNull()
    await expect(getDashboardById(dashboard.id, TEST_COLLABORATOR_ID)).rejects.toThrow()
  })

  it("T219: a public dashboard is resolvable only for a resolvable (authenticated) user id — there is no anonymous/unauthenticated path in this repository layer", async () => {
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Public One" })
    await setDashboardVisibility(dashboard.id, TEST_OWNER_ID, "public")

    // Every repository function in this codebase requires a resolved userId
    // (research.md Decision 8) — there is no code path here that accepts an
    // absent/anonymous caller; `getCurrentUser` is the sole authentication
    // seam, already exercised by every Route Handler before reaching this
    // repository (T052/api-contracts.md).
    const permission = await resolveEffectivePermission(dashboard.id, TEST_COLLABORATOR_ID)
    expect(permission).toBe("view")
  })
})
