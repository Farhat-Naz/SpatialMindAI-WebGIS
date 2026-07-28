import type { ReactNode } from "react"
import { useEffect } from "react"
import { render, waitFor } from "@testing-library/react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import type { Map as LeafletMap } from "leaflet"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DashboardSpatialFilterControl } from "../DashboardSpatialFilterControl"
import { useDashboardFilterStore } from "../../../store/dashboardFilterStore"

function MapRefCapture({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

function wrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MapContainer center={[0, 0]} zoom={2} className="h-64 w-64">
        <TileLayer url="https://example.test/{z}/{x}/{y}.png" />
        {children}
      </MapContainer>
    )
  }
}

const INITIAL_STORE_STATE = useDashboardFilterStore.getState()
const geometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }

async function renderControlAndGetMap(): Promise<LeafletMap> {
  let capturedMap: LeafletMap | null = null
  render(
    <>
      <MapRefCapture onReady={(map) => (capturedMap = map)} />
      <DashboardSpatialFilterControl />
    </>,
    { wrapper: wrapper() },
  )
  await waitFor(() => expect(capturedMap).not.toBeNull())
  return capturedMap as unknown as LeafletMap
}

describe("DashboardSpatialFilterControl (US6/T254)", () => {
  beforeEach(() => {
    useDashboardFilterStore.setState(INITIAL_STORE_STATE, true)
  })

  it("enables Geoman polygon draw mode once MapWidget's 'Draw filter area' button activates it", async () => {
    const map = await renderControlAndGetMap()
    const enableSpy = vi.spyOn(map.pm, "enableDraw")

    useDashboardFilterStore.getState().activateSpatialDraw()

    await waitFor(() => expect(enableSpy).toHaveBeenCalledWith("Polygon"))
  })

  it("Acceptance Scenario 4 — a completed draw stores the geometry as a global spatial filter and turns draw mode back off", async () => {
    const map = await renderControlAndGetMap()
    const enableSpy = vi.spyOn(map.pm, "enableDraw")
    vi.spyOn(map, "removeLayer").mockImplementation(() => map)

    useDashboardFilterStore.getState().activateSpatialDraw()
    // Wait for the draw-mode-sync effect to actually re-run before firing
    // `pm:create` — otherwise the event races ahead of React's re-render and
    // `handleCreate`'s still-stale closure sees `spatialDrawActive: false`.
    await waitFor(() => expect(enableSpy).toHaveBeenCalledWith("Polygon"))

    map.fire("pm:create", {
      shape: "Polygon",
      layer: { toGeoJSON: () => ({ type: "Feature", geometry, properties: {} }) },
    })

    await waitFor(() =>
      expect(useDashboardFilterStore.getState().activeGlobalFilters).toContainEqual(
        expect.objectContaining({ filterType: "spatial", config: { geometry } }),
      ),
    )
    expect(useDashboardFilterStore.getState().spatialDrawActive).toBe(false)
  })

  it("cross-talk guard — ignores a pm:create event fired while this control's own draw mode is not active", async () => {
    const map = await renderControlAndGetMap()
    vi.spyOn(map, "removeLayer").mockImplementation(() => map)

    map.fire("pm:create", {
      shape: "Polygon",
      layer: { toGeoJSON: () => ({ type: "Feature", geometry, properties: {} }) },
    })

    expect(useDashboardFilterStore.getState().activeGlobalFilters).toEqual([])
  })
})
