import { describe, expect, it } from "vitest"
import { createLayerSchema, renameLayerSchema, reorderLayersSchema } from "../layer.schema"

describe("createLayerSchema", () => {
  it("accepts a valid name", () => {
    expect(createLayerSchema.safeParse({ name: "Roads" }).success).toBe(true)
  })

  it("rejects an empty name", () => {
    expect(createLayerSchema.safeParse({ name: "" }).success).toBe(false)
  })
})

describe("renameLayerSchema", () => {
  it("accepts a valid name", () => {
    expect(renameLayerSchema.safeParse({ name: "Parcels" }).success).toBe(true)
  })

  it("rejects a missing name", () => {
    expect(renameLayerSchema.safeParse({}).success).toBe(false)
  })
})

describe("reorderLayersSchema", () => {
  it("accepts a non-empty ordered id list", () => {
    expect(
      reorderLayersSchema.safeParse({ orderedLayerIds: ["a", "b"] }).success,
    ).toBe(true)
  })

  it("rejects an empty array", () => {
    expect(reorderLayersSchema.safeParse({ orderedLayerIds: [] }).success).toBe(false)
  })
})
