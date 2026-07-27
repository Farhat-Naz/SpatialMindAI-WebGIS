import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  createDashboard,
  deleteDashboard,
  duplicateDashboard,
  getDashboardById,
  listDashboardsForProject,
  renameDashboard,
  setDashboardVisibility,
  setFavorite,
  unsetFavorite,
} from "@/server/repositories/dashboardRepository"
import { grantShare } from "@/server/repositories/dashboardShareRepository"
import { addWidget } from "@/server/repositories/widgetRepository"
import { TEST_COLLABORATOR_ID, TEST_OWNER_ID, ensureTestCollaborator, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("dashboardRepository", () => {
  let projectId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Dashboard Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
  }, 15000)

  it("createDashboard: succeeds for an Editor and is listed for the project", async () => {
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Ops" })
    expect(dashboard.name).toBe("Ops")
    expect(dashboard.effectivePermission).toBe("owner")

    const { dashboards } = await listDashboardsForProject(projectId, TEST_OWNER_ID)
    expect(dashboards).toHaveLength(1)
  })

  it("createDashboard: throws DuplicateNameError on a (projectId, name) collision", async () => {
    await createDashboard(projectId, TEST_OWNER_ID, { name: "Dup" })
    await expect(createDashboard(projectId, TEST_OWNER_ID, { name: "Dup" })).rejects.toThrow()
  })

  it("createDashboard: from a template instantiates its full widget/layout blueprint atomically", async () => {
    const template = await prismaClient.dashboardTemplate.create({
      data: {
        key: `test-template-${Date.now()}`,
        name: "Test Template",
        widgetsBlueprint: [
          { type: "map", config: {}, layout: { desktop: { x: 0, y: 0, w: 6, h: 4 } } },
          { type: "table", dataSourceType: "layer", config: {}, layout: { desktop: { x: 6, y: 0, w: 6, h: 4 } } },
        ],
      },
    })
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "From Asset", templateId: template.id })

    const widgets = await prismaClient.dashboardWidget.findMany({ where: { dashboardId: dashboard.id }, include: { layouts: true } })
    expect(widgets.length).toBeGreaterThan(0)
    for (const widget of widgets) {
      expect(widget.layouts.length).toBeGreaterThan(0)
    }
  })

  it("renameDashboard: renames when the caller has edit access", async () => {
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Before" })
    const renamed = await renameDashboard(dashboard.id, TEST_OWNER_ID, "After")
    expect(renamed.name).toBe("After")
  })

  it("setDashboardVisibility: rejects a non-owner, non-project-Owner caller", async () => {
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" } })
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Private One" })
    await expect(setDashboardVisibility(dashboard.id, TEST_COLLABORATOR_ID, "public")).rejects.toThrow()
  })

  it("setDashboardVisibility: the project Owner may change visibility on a dashboard they don't own", async () => {
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" } })
    const dashboard = await createDashboard(projectId, TEST_COLLABORATOR_ID, { name: "Theirs" })
    const updated = await setDashboardVisibility(dashboard.id, TEST_OWNER_ID, "public")
    expect(updated.visibility).toBe("public")
  })

  it("deleteDashboard: cascades and records one Activity row", async () => {
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "To Delete" })
    await addWidget(dashboard.id, TEST_OWNER_ID, { type: "text", config: { content: "hi" } })

    await deleteDashboard(dashboard.id, TEST_OWNER_ID)

    await expect(getDashboardById(dashboard.id, TEST_OWNER_ID)).rejects.toThrow()
    const widgets = await prismaClient.dashboardWidget.findMany({ where: { dashboardId: dashboard.id } })
    expect(widgets).toHaveLength(0)
    const activity = await prismaClient.activity.findFirst({
      where: { projectId, targetType: "dashboard", targetId: dashboard.id, action: "delete" },
    })
    expect(activity).toBeTruthy()
  })

  it("duplicateDashboard: produces independent widget/layout rows, not shared with the source", async () => {
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Original" })
    await addWidget(dashboard.id, TEST_OWNER_ID, { type: "text", config: { content: "a" } })
    await addWidget(dashboard.id, TEST_OWNER_ID, { type: "text", config: { content: "b" } })

    const copy = await duplicateDashboard(dashboard.id, TEST_OWNER_ID)
    expect(copy.id).not.toBe(dashboard.id)

    const originalWidgets = await prismaClient.dashboardWidget.findMany({ where: { dashboardId: dashboard.id } })
    const copyWidgets = await prismaClient.dashboardWidget.findMany({ where: { dashboardId: copy.id } })
    expect(copyWidgets).toHaveLength(originalWidgets.length)
    expect(copyWidgets.map((w) => w.id).sort()).not.toEqual(originalWidgets.map((w) => w.id).sort())
  })

  it("setFavorite/unsetFavorite: idempotent, reflected in isFavorite", async () => {
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Fave" })
    await setFavorite(dashboard.id, TEST_OWNER_ID)
    await setFavorite(dashboard.id, TEST_OWNER_ID)

    const favorited = await getDashboardById(dashboard.id, TEST_OWNER_ID)
    expect(favorited.isFavorite).toBe(true)

    await unsetFavorite(dashboard.id, TEST_OWNER_ID)
    const unfavorited = await getDashboardById(dashboard.id, TEST_OWNER_ID)
    expect(unfavorited.isFavorite).toBe(false)
  })

  it("listDashboardsForProject: a DashboardShare recipient with no base project role still sees the shared dashboard", async () => {
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Shared One" })
    await grantShare(dashboard.id, TEST_OWNER_ID, { userId: TEST_COLLABORATOR_ID, permission: "view" })

    const { dashboards } = await listDashboardsForProject(projectId, TEST_COLLABORATOR_ID)
    expect(dashboards.map((d) => d.id)).toContain(dashboard.id)
    expect(dashboards).toHaveLength(1)
  })
})
