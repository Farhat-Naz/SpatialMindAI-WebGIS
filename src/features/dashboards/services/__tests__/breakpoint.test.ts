import { describe, expect, it } from "vitest"
import { resolveBreakpoint } from "../breakpoint"

describe("resolveBreakpoint", () => {
  it("resolves widths at or under the mobile threshold to mobile", () => {
    expect(resolveBreakpoint(320)).toBe("mobile")
    expect(resolveBreakpoint(767)).toBe("mobile")
  })

  it("resolves widths between the mobile and tablet thresholds to tablet", () => {
    expect(resolveBreakpoint(768)).toBe("tablet")
    expect(resolveBreakpoint(1279)).toBe("tablet")
  })

  it("resolves widths above the tablet threshold to desktop", () => {
    expect(resolveBreakpoint(1280)).toBe("desktop")
    expect(resolveBreakpoint(1920)).toBe("desktop")
  })
})
