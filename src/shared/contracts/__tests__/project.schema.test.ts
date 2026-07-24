import { describe, expect, it } from "vitest"
import { createProjectSchema, updateProjectSchema } from "../project.schema"

describe("createProjectSchema", () => {
  it("accepts a valid name with an optional description", () => {
    const result = createProjectSchema.safeParse({
      name: "Downtown Survey",
      description: "2026 field survey",
    })
    expect(result.success).toBe(true)
  })

  it("accepts a name with no description", () => {
    const result = createProjectSchema.safeParse({ name: "Downtown Survey" })
    expect(result.success).toBe(true)
  })

  it("rejects an empty name", () => {
    const result = createProjectSchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
  })

  it("rejects a whitespace-only name", () => {
    const result = createProjectSchema.safeParse({ name: "   " })
    expect(result.success).toBe(false)
  })
})

describe("updateProjectSchema", () => {
  it("accepts a name-only update", () => {
    const result = updateProjectSchema.safeParse({ name: "New Name" })
    expect(result.success).toBe(true)
  })

  it("accepts a description-only update", () => {
    const result = updateProjectSchema.safeParse({ description: "New description" })
    expect(result.success).toBe(true)
  })

  it("rejects an empty update body", () => {
    const result = updateProjectSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
