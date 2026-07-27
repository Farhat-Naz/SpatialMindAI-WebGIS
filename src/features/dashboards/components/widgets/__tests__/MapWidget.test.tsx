import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/features/map", () => ({
  MapContainer: ({ className }: { className?: string }) => <div data-testid="map-container" className={className} />,
}))

describe("MapWidget", () => {
  it("mounts the map feature's MapContainer, never a second Leaflet integration", async () => {
    const { MapWidget } = await import("../MapWidget")
    render(<MapWidget />)
    expect(screen.getByTestId("map-container")).toBeTruthy()
  })
})
