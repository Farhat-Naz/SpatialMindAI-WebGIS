import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"
import {
  compareVersions,
  listVersionsForProject,
  restoreVersion,
  saveVersion,
} from "../versionRepository"

const dbAvailable = await isDatabaseAvailable()

async function createFeature(layerId: string, lng: number, lat: number): Promise<string> {
  const rows = await prismaClient.$queryRaw<{ id: string }[]>`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${layerId}, ST_GeomFromGeoJSON(${JSON.stringify({ type: "Point", coordinates: [lng, lat] })}), NOW(), NOW())
    RETURNING id
  `
  return rows[0].id
}

describe.skipIf(!dbAvailable)("versionRepository", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Version Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L1", order: 0 } })
    layerId = layer.id
    await createFeature(layerId, 1, 1)
  })

  it("saves a version capturing the current full snapshot", async () => {
    const version = await saveVersion(projectId, TEST_OWNER_ID, "Initial save")
    expect(version.note).toBe("Initial save")
    expect(version.isPreRestoreSnapshot).toBe(false)

    const snapshot = version.snapshot as { layers: Array<{ features: unknown[] }> }
    expect(snapshot.layers).toHaveLength(1)
    expect(snapshot.layers[0].features).toHaveLength(1)
  })

  it("lists versions without exposing the snapshot field", async () => {
    await saveVersion(projectId, TEST_OWNER_ID)
    const versions = await listVersionsForProject(projectId)
    expect(versions).toHaveLength(1)
    expect((versions[0] as Record<string, unknown>).snapshot).toBeUndefined()
  })

  it("restoring creates a pre-restore snapshot, replaces content, and never deletes a version (SC-007)", async () => {
    const v1 = await saveVersion(projectId, TEST_OWNER_ID, "v1")

    await createFeature(layerId, 2, 2)
    const beforeRestoreCount = await prismaClient.feature.count({ where: { layerId } })
    expect(beforeRestoreCount).toBe(2)

    const versionsBeforeRestore = await listVersionsForProject(projectId)
    expect(versionsBeforeRestore).toHaveLength(1)

    await restoreVersion(projectId, v1.id, TEST_OWNER_ID)

    const afterRestoreCount = await prismaClient.feature.count({ where: { layerId } })
    expect(afterRestoreCount).toBe(1)

    const versionsAfterRestore = await listVersionsForProject(projectId)
    // Exactly one more version than existed before the restore (the
    // automatic pre-restore snapshot) — never fewer.
    expect(versionsAfterRestore.length).toBe(versionsBeforeRestore.length + 1)
    expect(versionsAfterRestore.some((v) => v.isPreRestoreSnapshot)).toBe(true)

    const activity = await prismaClient.activity.findFirst({
      where: { projectId, action: "version_restore", targetId: v1.id },
    })
    expect(activity).not.toBeNull()
  })

  it("compares two versions and reports added/removed/changed features", async () => {
    const v1 = await saveVersion(projectId, TEST_OWNER_ID, "before")
    await createFeature(layerId, 5, 5)
    const v2 = await saveVersion(projectId, TEST_OWNER_ID, "after")

    const diff = await compareVersions(v1.id, v2.id)
    expect(diff.addedFeatureIds).toHaveLength(1)
    expect(diff.removedFeatureIds).toHaveLength(0)
  })
})
