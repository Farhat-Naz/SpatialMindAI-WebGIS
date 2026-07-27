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

// ---------------------------------------------------------------------------
// specs/005-import-export (T046) — additive scope/CRS/PDF cases.
// The tests above are unchanged, which is the point: widening this repository
// must not alter any existing caller's behavior.
// ---------------------------------------------------------------------------

describe.skipIf(!dbAvailable)("exportLogRepository — 005 additions", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Export Scope Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L", order: 0 } })
    layerId = layer.id
  }, 15000)

  it("defaults scope to 'layer' when omitted, so 007 callers are unchanged", async () => {
    const entry = await logExport(projectId, TEST_OWNER_ID, {
      sourceLayerId: layerId,
      format: "geojson",
      status: "succeeded",
      featureCount: 10,
    })
    expect(entry.scope).toBe("layer")
    expect(entry.outputCrs).toBeNull()
    expect(entry.layerCount).toBeNull()
  })

  it("accepts the pdf format (FR-034)", async () => {
    const entry = await logExport(projectId, TEST_OWNER_ID, {
      sourceLayerId: layerId,
      format: "pdf",
      status: "succeeded",
      scope: "layer",
    })
    expect(entry.format).toBe("pdf")
  })

  it("records a selection-scope export with an output CRS (FR-035, FR-041)", async () => {
    const entry = await logExport(projectId, TEST_OWNER_ID, {
      sourceLayerId: layerId,
      format: "shapefile",
      status: "succeeded",
      scope: "selection",
      outputCrs: "EPSG:3857",
      featureCount: 12,
    })
    expect(entry.scope).toBe("selection")
    expect(entry.outputCrs).toBe("EPSG:3857")
  })

  it("records a project-scope export with a layer count (FR-037)", async () => {
    const entry = await logExport(projectId, TEST_OWNER_ID, {
      format: "geojson",
      status: "succeeded",
      scope: "project",
      layerCount: 4,
      featureCount: 12830,
    })
    expect(entry.scope).toBe("project")
    expect(entry.layerCount).toBe(4)
  })

  it("rejects a project-scope export that names a single source layer", async () => {
    await expect(
      logExport(projectId, TEST_OWNER_ID, {
        format: "geojson",
        status: "succeeded",
        scope: "project",
        sourceLayerId: layerId,
      }),
    ).rejects.toThrow(/project-scope/i)
  })
})
