import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { NorthArrow } from "../components/NorthArrow"

describe("NorthArrow", () => {
  it("renders without error", () => {
    render(<NorthArrow />)
    expect(screen.getByRole("img", { name: "North" })).toBeTruthy()
  })
})
