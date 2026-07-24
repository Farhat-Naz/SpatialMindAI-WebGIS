import { describe, expect, it } from "vitest"
import { createFeatureSchema, updateFeatureSchema } from "../feature.schema"

const point = { type: "Point" as const, coordinates: [10, 20] as [number, number] }

describe("createFeatureSchema", () => {
  it("accepts a geometry-only feature", () => {
    expect(createFeatureSchema.safeParse({ geometry: point }).success).toBe(true)
  })

  it("accepts geometry with attributes and style", () => {
    const result = createFeatureSchema.safeParse({
      geometry: point,
      attributes: [{ key: "name", value: "A" }],
      style: { color: "#ff0000", fillOpacity: 0.5 },
    })
    expect(result.success).toBe(true)
  })

  it("rejects duplicate attribute keys", () => {
    const result = createFeatureSchema.safeParse({
      geometry: point,
      attributes: [
        { key: "name", value: "A" },
        { key: "name", value: "B" },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a missing geometry", () => {
    expect(createFeatureSchema.safeParse({}).success).toBe(false)
  })
})

describe("updateFeatureSchema", () => {
  it("accepts an attributes-only update", () => {
    const result = updateFeatureSchema.safeParse({
      attributes: [{ key: "name", value: "Updated" }],
    })
    expect(result.success).toBe(true)
  })

  it("rejects an empty update body", () => {
    expect(updateFeatureSchema.safeParse({}).success).toBe(false)
  })
})
