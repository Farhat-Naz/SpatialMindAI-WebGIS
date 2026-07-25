import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { deleteMeasurement, listMeasurementsForProject, saveMeasurement } from "@/server/repositories/measurementRepository"
import { TEST_COLLABORATOR_ID, TEST_OWNER_ID, ensureTestCollaborator, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("measurementRepository", () => {
  let projectId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Measurement Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Viewer" } })
  }, 15000)

  it(
    "saveMeasurement: recomputes distance server-side from the submitted geometry, not a client-supplied value",
    async () => {
      // ~1 degree of longitude at the equator ≈ 111.2km.
      const line = { type: "LineString" as const, coordinates: [[0, 0], [1, 0]] as [number, number][] }
      const measurement = await saveMeasurement(projectId, TEST_OWNER_ID, {
        measurementType: "distance",
        geometry: line,
      })
      expect(measurement.unit).toBe("meters")
      expect(measurement.value).toBeGreaterThan(111000)
      expect(measurement.value).toBeLessThan(111400)
      expect(measurement.geometry).toEqual(line)
    },
    15000,
  )

  it(
    "saveMeasurement: coordinates type has no scalar value",
    async () => {
      const point = { type: "Point" as const, coordinates: [10, 20] as [number, number] }
      const measurement = await saveMeasurement(projectId, TEST_OWNER_ID, {
        measurementType: "coordinates",
        geometry: point,
      })
      expect(measurement.value).toBeNull()
      expect(measurement.unit).toBeNull()
    },
    15000,
  )

  it(
    "saveMeasurement: rejects an invalid geometry",
    async () => {
      const selfIntersecting = {
        type: "Polygon" as const,
        coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] as [number, number][][],
      }
      await expect(
        saveMeasurement(projectId, TEST_OWNER_ID, { measurementType: "area", geometry: selfIntersecting }),
      ).rejects.toThrow()
    },
    15000,
  )

  it(
    "saveMeasurement: a Viewer cannot save (Editor+ required)",
    async () => {
      const point = { type: "Point" as const, coordinates: [0, 0] as [number, number] }
      await expect(
        saveMeasurement(projectId, TEST_COLLABORATOR_ID, { measurementType: "coordinates", geometry: point }),
      ).rejects.toThrow()
    },
    15000,
  )

  it(
    "listMeasurementsForProject / deleteMeasurement: creator can delete their own",
    async () => {
      const point = { type: "Point" as const, coordinates: [5, 5] as [number, number] }
      const measurement = await saveMeasurement(projectId, TEST_OWNER_ID, { measurementType: "coordinates", geometry: point })

      const { measurements } = await listMeasurementsForProject(projectId, TEST_OWNER_ID, {})
      expect(measurements).toHaveLength(1)

      await deleteMeasurement(measurement.id, TEST_OWNER_ID)
      const after = await listMeasurementsForProject(projectId, TEST_OWNER_ID, {})
      expect(after.measurements).toHaveLength(0)
    },
    15000,
  )
})
