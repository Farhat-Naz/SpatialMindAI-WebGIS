import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { GET, POST } from "@/app/api/layers/[layerId]/features/route"
import { DELETE, GET as GET_FEATURE } from "@/app/api/features/[featureId]/route"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_OWNER_ID,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

/**
 * Exercises the full copy -> delete original -> paste data flow (US4,
 * quickstart.md Section 10) through the same Route Handlers `useCopyFeature`/
 * `usePasteFeature` call. The clipboard itself is an in-memory `editingStore`
 * snapshot (not persisted), so this test simulates it directly with the
 * created feature's own geometry/attributes/style, matching exactly what
 * `snapshotFeature` would have captured before the delete.
 */
describe.skipIf(!dbAvailable)("Copy, paste, and duplicate (integration)", () => {
  let layerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Copy/Paste Integration Project" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "Copy/Paste Integration Layer", order: 0 },
    })
    layerId = layer.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("paste still succeeds after the original is deleted, producing an independent copy", async () => {
    const createResponse = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: { type: "Point", coordinates: [5, 5] },
        attributes: [{ key: "name", value: "Copy Me" }],
        style: { color: "#abcdef" },
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { feature: original } = await createResponse.json()

    // Copy: snapshotFeature(feature) into editingStore.clipboard — simulated
    // here as a plain object, since the clipboard is never persisted server-side.
    const clipboard = {
      geometry: original.geometry,
      attributes: original.attributes,
      style: original.style,
    }

    const deleteResponse = await DELETE(
      jsonRequest(`http://localhost/api/features/${original.id}`, "DELETE") as never,
      { params: Promise.resolve({ featureId: original.id }) },
    )
    expect(deleteResponse.status).toBe(204)

    // Paste: usePasteFeature's useCreateFeature call from the clipboard snapshot.
    const pasteResponse = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", clipboard) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(pasteResponse.status).toBe(201)
    const { feature: pasted } = await pasteResponse.json()

    expect(pasted.id).not.toBe(original.id)
    expect(pasted.geometry).toEqual(original.geometry)
    expect(pasted.attributes).toEqual(original.attributes)
    expect(pasted.style).toEqual(original.style)

    const originalStillGone = await GET_FEATURE(
      jsonRequest(`http://localhost/api/features/${original.id}`, "GET") as never,
      { params: Promise.resolve({ featureId: original.id }) },
    )
    expect(originalStillGone.status).toBe(404)
  })

  it("duplicate creates a second independent feature from the same source in one action", async () => {
    const createResponse = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: { type: "Point", coordinates: [7, 7] },
        attributes: [{ key: "name", value: "Duplicate Me" }],
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { feature: source } = await createResponse.json()

    // Duplicate: useDuplicateFeature's create call, skipping the clipboard entirely.
    const duplicateResponse = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: source.geometry,
        attributes: source.attributes,
        style: source.style ?? undefined,
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(duplicateResponse.status).toBe(201)
    const { feature: duplicate } = await duplicateResponse.json()

    expect(duplicate.id).not.toBe(source.id)
    expect(duplicate.geometry).toEqual(source.geometry)
    expect(duplicate.attributes).toEqual(source.attributes)

    const listResponse = await GET(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "GET") as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { features } = await listResponse.json()
    expect(features.some((f: { id: string }) => f.id === source.id)).toBe(true)
    expect(features.some((f: { id: string }) => f.id === duplicate.id)).toBe(true)
  })
})
