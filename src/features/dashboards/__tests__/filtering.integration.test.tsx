import type { ReactNode } from "react"
import { useEffect } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import type { Map as LeafletMap } from "leaflet"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useLayers } from "@/features/database/hooks/useLayers"
import { useAnalysisRuns } from "@/features/analysis/hooks/useAnalysis"
import { widgetService } from "../services/widgetService"
import { dashboardFilterService } from "../services/dashboardFilterService"
import { DashboardFilterBar } from "../components/DashboardFilterBar"
import { WidgetConfigPanel } from "../components/WidgetConfigPanel"
import { WidgetRenderer } from "../components/WidgetRenderer"
import { DashboardSpatialFilterControl } from "../components/widgets/DashboardSpatialFilterControl"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import { useDashboardFilterStore } from "../store/dashboardFilterStore"
import type { ActiveWidgetFilter } from "../types/widget.types"
import type { DashboardWidgetRecord } from "../types/dashboard.types"

/**
 * Full Filtering flow (quickstart.md §6; spec.md US6 Acceptance Scenarios
 * 1–5) — real `DashboardFilterBar`/`WidgetConfigPanel`/`WidgetRenderer`/
 * `DashboardSpatialFilterControl` composed together, with only the service
 * boundary (`widgetService`/`dashboardFilterService`) mocked, matching
 * `liveAnalytics.integration.test.tsx`'s established pattern.
 */

vi.mock("@/features/database/hooks/useLayers", () => ({ useLayers: vi.fn() }))
vi.mock("@/features/analysis/hooks/useAnalysis", () => ({ useAnalysisRuns: vi.fn() }))
vi.mock("../services/dashboardFilterService", () => ({
  dashboardFilterService: { listFilters: vi.fn(), createFilter: vi.fn(), deleteFilter: vi.fn() },
}))

const mockedFilterService = vi.mocked(dashboardFilterService)

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function widget(overrides: Partial<DashboardWidgetRecord> = {}): DashboardWidgetRecord {
  return {
    id: "w1",
    dashboardId: "d1",
    type: "chartBar",
    title: "Parcels by Status",
    dataSourceType: "layer",
    dataSourceId: "layer-1",
    config: { groupByAttribute: "status" },
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  }
}

function MapRefCapture({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

const INITIAL_FILTER_STORE_STATE = useDashboardFilterStore.getState()
const INITIAL_BUILDER_STORE_STATE = useDashboardBuilderStore.getState()

beforeEach(() => {
  useDashboardFilterStore.setState(INITIAL_FILTER_STORE_STATE, true)
  useDashboardBuilderStore.setState(INITIAL_BUILDER_STORE_STATE, true)
  vi.mocked(useLayers).mockReturnValue({
    data: [
      { id: "layer-1", name: "Parcels" },
      { id: "layer-2", name: "Roads" },
    ],
  } as never)
  vi.mocked(useAnalysisRuns).mockReturnValue({ data: { runs: [] } } as never)
  mockedFilterService.listFilters.mockResolvedValue({ filters: [] })
  mockedFilterService.createFilter.mockResolvedValue({ filter: {} as never })
  mockedFilterService.deleteFilter.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Filtering — full flow", () => {
  it("Scenario 1: setting a global date range sends the active date filter to a date-aware widget's data fetch", async () => {
    const dataSpy = vi
      .spyOn(widgetService, "getWidgetData")
      .mockResolvedValue({ dataSourceUnavailable: false, data: { features: [] } })

    render(
      <>
        <DashboardFilterBar projectId="p1" dashboardId="d1" />
        <WidgetRenderer dashboardId="d1" widget={widget()} canEdit={false} />
      </>,
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(dataSpy).toHaveBeenCalledWith("d1", "w1", []))

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } })

    await waitFor(() =>
      expect(dataSpy).toHaveBeenCalledWith("d1", "w1", [
        { filterType: "date", config: { from: "2026-01-01T00:00:00.000Z" } },
      ]),
    )
  })

  it("Scenario 2: a layer filter that excludes this widget's own layer shows the empty-filter state, distinct from 'unavailable'", async () => {
    vi.spyOn(widgetService, "getWidgetData").mockImplementation(async (_dashboardId, _widgetId, filters: ActiveWidgetFilter[] = []) => {
      const layerFilter = filters.find((filter) => filter.filterType === "layer")
      if (layerFilter) {
        const layerIds = (layerFilter.config as { layerIds: string[] }).layerIds
        if (!layerIds.includes("layer-1")) {
          return { dataSourceUnavailable: false, data: { features: [] }, filteredEmpty: true }
        }
      }
      return { dataSourceUnavailable: false, data: { features: [{ id: "f1", attributes: [{ key: "status", value: "open" }] }] } }
    })

    render(
      <>
        <DashboardFilterBar projectId="p1" dashboardId="d1" />
        <WidgetRenderer dashboardId="d1" widget={widget()} canEdit={false} />
      </>,
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull())
    expect(screen.queryByText("No data matches the current filters")).toBeNull()
    expect(screen.queryByText("Data source unavailable")).toBeNull()

    const select = screen.getByLabelText("Layers") as HTMLSelectElement
    select.options[1].selected = true // "Roads" (layer-2) — not this widget's own layer-1
    fireEvent.change(select)

    await waitFor(() => expect(screen.getByText("No data matches the current filters")).toBeTruthy())
    expect(screen.queryByText("Data source unavailable")).toBeNull()
  })

  it("Scenario 3: a per-widget attribute filter set via WidgetConfigPanel is sent on that widget's own data fetch", async () => {
    // The dashboard starts with no persisted filters; once `createFilter`
    // succeeds and its invalidation triggers a refetch, every *subsequent*
    // `listFilters` call returns the now-persisted attribute filter — set up
    // both responses up front rather than swapping the mock mid-test, so
    // the refetch (which happens on invalidation, not on this test's own
    // schedule) always sees the right one.
    mockedFilterService.listFilters
      .mockResolvedValueOnce({ filters: [] })
      .mockResolvedValue({
        filters: [
          {
            id: "f1",
            dashboardId: "d1",
            widgetId: "w1",
            filterType: "attribute",
            config: { key: "status", operator: "eq", value: "active" },
            createdAt: "t",
            updatedAt: "t",
          },
        ],
      })
    const dataSpy = vi
      .spyOn(widgetService, "getWidgetData")
      .mockResolvedValue({ dataSourceUnavailable: false, data: { features: [] } })

    useDashboardBuilderStore.getState().selectWidget("w1", widget().config as Record<string, unknown>, "chartBar")

    render(
      <>
        <WidgetConfigPanel projectId="p1" dashboardId="d1" open={true} onOpenChange={() => {}} />
        <WidgetRenderer dashboardId="d1" widget={widget()} canEdit={false} />
      </>,
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(dataSpy).toHaveBeenCalledWith("d1", "w1", []))

    fireEvent.change(screen.getByLabelText("Attribute key"), { target: { value: "status" } })
    fireEvent.change(screen.getByLabelText("Attribute value"), { target: { value: "active" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() =>
      expect(mockedFilterService.createFilter).toHaveBeenCalledWith("d1", {
        widgetId: "w1",
        filterType: "attribute",
        config: { key: "status", operator: "eq", value: "active" },
      }),
    )

    await waitFor(() =>
      expect(dataSpy).toHaveBeenCalledWith("d1", "w1", [
        { filterType: "attribute", config: { key: "status", operator: "eq", value: "active" } },
      ]),
    )
  })

  it("Scenario 4: drawing a spatial filter area sends the geometry to a filter-aware widget's data fetch, and the bar shows it as active", async () => {
    const geometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
    const dataSpy = vi
      .spyOn(widgetService, "getWidgetData")
      .mockResolvedValue({ dataSourceUnavailable: false, data: { features: [] } })

    let capturedMap: LeafletMap | null = null
    render(
      <>
        <DashboardFilterBar projectId="p1" dashboardId="d1" />
        <WidgetRenderer dashboardId="d1" widget={widget()} canEdit={false} />
        <MapContainer center={[0, 0]} zoom={2} className="h-64 w-64">
          <TileLayer url="https://example.test/{z}/{x}/{y}.png" />
          <MapRefCapture onReady={(map) => (capturedMap = map)} />
          <DashboardSpatialFilterControl />
        </MapContainer>
      </>,
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(capturedMap).not.toBeNull())
    await waitFor(() => expect(dataSpy).toHaveBeenCalledWith("d1", "w1", []))

    const map = capturedMap as unknown as LeafletMap
    const enableSpy = vi.spyOn(map.pm, "enableDraw")
    vi.spyOn(map, "removeLayer").mockImplementation(() => map)

    // Equivalent to clicking MapWidget's "Draw filter area" button (T254).
    useDashboardFilterStore.getState().activateSpatialDraw()
    await waitFor(() => expect(enableSpy).toHaveBeenCalledWith("Polygon"))

    map.fire("pm:create", { shape: "Polygon", layer: { toGeoJSON: () => ({ type: "Feature", geometry, properties: {} }) } })

    await waitFor(() => expect(screen.getByText("Spatial filter active")).toBeTruthy())
    await waitFor(() => expect(dataSpy).toHaveBeenCalledWith("d1", "w1", [{ filterType: "spatial", config: { geometry } }]))
  })

  it("Scenario 5: 'Save filters' persists the working copy, and the next dashboard load restores it (FR-021/SC-005)", async () => {
    const first = render(<DashboardFilterBar projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } })
    await waitFor(() => expect(screen.getByRole("button", { name: "Save filters" })).toHaveProperty("disabled", false))
    fireEvent.click(screen.getByRole("button", { name: "Save filters" }))

    await waitFor(() =>
      expect(mockedFilterService.createFilter).toHaveBeenCalledWith(
        "d1",
        expect.objectContaining({ filterType: "date", config: { from: "2026-01-01T00:00:00.000Z" } }),
      ),
    )

    // "Reload": the dashboard is opened again in a fresh mount (the old view
    // unmounts, same as a real page navigation) — the saved row is now what
    // the server returns.
    first.unmount()
    mockedFilterService.listFilters.mockResolvedValue({
      filters: [
        {
          id: "f1",
          dashboardId: "d1",
          widgetId: null,
          filterType: "date",
          config: { from: "2026-01-01T00:00:00.000Z" },
          createdAt: "t",
          updatedAt: "t",
        },
      ],
    })
    render(<DashboardFilterBar projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByLabelText("From")).toHaveProperty("value", "2026-01-01"))
  })
})
