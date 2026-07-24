import { render, screen } from "@testing-library/react"
import { MapContainer, TileLayer } from "react-leaflet"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { MeasurementToolbar } from "../components/MeasurementToolbar"
import { useEditingStore } from "../store/editingStore"

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MapContainer center={[0, 0]} zoom={2} className="h-64 w-64">
      <TileLayer url="https://example.test/{z}/{x}/{y}.png" />
      {children}
    </MapContainer>
  )
}

describe("MeasurementToolbar", () => {
  beforeEach(() => {
    useEditingStore.setState({
      tool: null,
      draftGeometry: null,
      targetLayerId: null,
      targetFeatureId: null,
      undoSnapshot: null,
      measurementResult: null,
      importResult: null,
      lockedLayerIds: new Set(),
      layerDisplay: {},
      clipboard: null,
      lastError: null,
      contextMenuTarget: null,
    })
  })

  it("renders both measurement tool buttons", () => {
    render(<MeasurementToolbar />, { wrapper: Wrapper })
    expect(screen.getByRole("radio", { name: "Measure distance" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Measure area" })).toBeTruthy()
  })

  it("shows no result panel until a measurement is in progress", () => {
    render(<MeasurementToolbar />, { wrapper: Wrapper })
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("shows no result panel immediately after activating a tool (no points clicked yet)", () => {
    // The component's own live-recompute effect clears any stale result on
    // mount/tool-switch when fewer than 2 points exist — this is correct
    // behavior (a fresh measurement session starts with no result), not
    // something a test should try to bypass by injecting store state the
    // component itself would immediately overwrite.
    useEditingStore.setState({ tool: "measure-distance" })
    render(<MeasurementToolbar />, { wrapper: Wrapper })
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("clears the measurement result when switching tools", () => {
    useEditingStore.getState().setMeasurementResult({ value: 500, unit: "distance" })
    useEditingStore.getState().setTool("measure-area")

    expect(useEditingStore.getState().measurementResult).toBeNull()
  })
})
