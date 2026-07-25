import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { logExport, listExportsForProject } from "@/server/repositories/exportLogRepository"
import { TEST_COLLABORATOR_ID, TEST_OWNER_ID, ensureTestCollaborator, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("exportLogRepository", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Export Log Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Viewer" } })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L", order: 0 } })
    layerId = layer.id
  }, 15000)

  it("logExport: records a successful layer export", async () => {
    const entry = await logExport(projectId, TEST_OWNER_ID, {
      sourceLayerId: layerId,
      format: "geojson",
      status: "succeeded",
      featureCount: 42,
    })
    expect(entry.status).toBe("succeeded")
    expect(entry.featureCount).toBe(42)

    const { exports: history } = await listExportsForProject(projectId, TEST_OWNER_ID, {})
    expect(history).toHaveLength(1)
    expect(history[0].id).toBe(entry.id)
  })

  it("logExport: records a failed export with an error message", async () => {
    const entry = await logExport(projectId, TEST_OWNER_ID, {
      sourceLayerId: layerId,
      format: "shapefile",
      status: "failed",
      errorMessage: "Browser memory limit exceeded.",
    })
    expect(entry.status).toBe("failed")
    expect(entry.errorMessage).toBe("Browser memory limit exceeded.")
  })

  it("logExport: rejects both sourceAnalysisRunId and sourceLayerId set at once", async () => {
    await expect(
      logExport(projectId, TEST_OWNER_ID, {
        sourceLayerId: layerId,
        sourceAnalysisRunId: "some-run-id",
        format: "csv",
        status: "succeeded",
      }),
    ).rejects.toThrow()
  })

  it("logExport: a Viewer cannot log an export (Editor+ required)", async () => {
    await expect(
      logExport(projectId, TEST_COLLABORATOR_ID, { sourceLayerId: layerId, format: "csv", status: "succeeded" }),
    ).rejects.toThrow()
  })
})
