import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useLayers } from "@/features/database/hooks/useLayers"
import { dashboardFilterService } from "../../services/dashboardFilterService"
import { useDashboardFilterStore } from "../../store/dashboardFilterStore"
import { DashboardFilterBar } from "../DashboardFilterBar"

vi.mock("@/features/database/hooks/useLayers", () => ({ useLayers: vi.fn() }))
vi.mock("../../services/dashboardFilterService", () => ({
  dashboardFilterService: { listFilters: vi.fn(), createFilter: vi.fn(), deleteFilter: vi.fn() },
}))

const mockedFilterService = vi.mocked(dashboardFilterService)
const INITIAL_STORE_STATE = useDashboardFilterStore.getState()

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  useDashboardFilterStore.setState(INITIAL_STORE_STATE, true)
  vi.mocked(useLayers).mockReturnValue({ data: [{ id: "layer-1", name: "Parcels" }] } as never)
  mockedFilterService.listFilters.mockResolvedValue({ filters: [] })
  mockedFilterService.createFilter.mockResolvedValue({ filter: {} as never })
  mockedFilterService.deleteFilter.mockResolvedValue(undefined)
})

describe("DashboardFilterBar", () => {
  it("Acceptance Scenario 1 — setting a date range sets a working global date filter", async () => {
    render(<DashboardFilterBar projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } })

    await waitFor(() =>
      expect(useDashboardFilterStore.getState().activeGlobalFilters).toContainEqual(
        expect.objectContaining({ filterType: "date" }),
      ),
    )
    expect(useDashboardFilterStore.getState().hasUnsavedFilterChanges).toBe(true)
  })

  it("Acceptance Scenario 2 — selecting layers sets a working global layer filter", async () => {
    render(<DashboardFilterBar projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    const select = screen.getByLabelText("Layers") as HTMLSelectElement
    select.options[0].selected = true
    fireEvent.change(select)

    await waitFor(() =>
      expect(useDashboardFilterStore.getState().activeGlobalFilters).toContainEqual(
        expect.objectContaining({ filterType: "layer", config: { layerIds: ["layer-1"] } }),
      ),
    )
  })

  it("project filter (T251): checking 'This project only' sets a working global project filter scoped to the current project", async () => {
    render(<DashboardFilterBar projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    fireEvent.click(screen.getByLabelText("This project only"))

    await waitFor(() =>
      expect(useDashboardFilterStore.getState().activeGlobalFilters).toContainEqual(
        expect.objectContaining({ filterType: "project", config: { projectIds: ["p1"] } }),
      ),
    )
  })

  it("Acceptance Scenario 4 (bar side) — shows a 'Spatial filter active' badge once a spatial filter is drawn, with a working Clear action", async () => {
    // This scenario is about the live, in-progress draw — not about
    // reconciling with persisted filters (T256 covers that) — so the
    // dashboard's own filter list is left permanently pending, which also
    // sidesteps the effect that resyncs the store from `useDashboardFilters`
    // whenever its `data` settles (it would otherwise wipe this direct,
    // pre-"Save filters" store write, exactly as a real, not-yet-saved
    // spatial-filter draw is never itself part of that persisted list).
    mockedFilterService.listFilters.mockReturnValue(new Promise(() => {}))

    render(<DashboardFilterBar projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    expect(screen.queryByText("Spatial filter active")).toBeNull()

    useDashboardFilterStore.getState().setGlobalFilter("spatial", { geometry: { type: "Polygon", coordinates: [] } })

    await waitFor(() => expect(screen.getByText("Spatial filter active")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    await waitFor(() => expect(screen.queryByText("Spatial filter active")).toBeNull())
  })

  it("Acceptance Scenario 5 — 'Save filters' persists the working copy via useCreateFilter, and is disabled with no unsaved changes", async () => {
    render(<DashboardFilterBar projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    expect(screen.getByRole("button", { name: "Save filters" })).toHaveProperty("disabled", true)

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } })
    await waitFor(() => expect(screen.getByRole("button", { name: "Save filters" })).toHaveProperty("disabled", false))

    fireEvent.click(screen.getByRole("button", { name: "Save filters" }))

    await waitFor(() =>
      expect(mockedFilterService.createFilter).toHaveBeenCalledWith(
        "d1",
        expect.objectContaining({ filterType: "date" }),
      ),
    )
  })

  it("T256 — reloading a dashboard with previously-saved filters restores them into the working copy (FR-021/SC-005)", async () => {
    mockedFilterService.listFilters.mockResolvedValue({
      filters: [
        {
          id: "f1",
          dashboardId: "d1",
          widgetId: null,
          filterType: "layer",
          config: { layerIds: ["layer-1"] },
          createdAt: "t",
          updatedAt: "t",
        },
      ],
    })

    render(<DashboardFilterBar projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    await waitFor(() =>
      expect(useDashboardFilterStore.getState().activeGlobalFilters).toContainEqual(
        expect.objectContaining({ filterType: "layer", config: { layerIds: ["layer-1"] } }),
      ),
    )
    expect(useDashboardFilterStore.getState().hasUnsavedFilterChanges).toBe(false)
  })
})
