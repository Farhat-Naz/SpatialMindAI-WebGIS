import { beforeEach, describe, expect, it } from "vitest"
import { useDashboardFilterStore } from "../dashboardFilterStore"
import type { DashboardFilterRecord } from "../../types/dashboard.types"

const INITIAL_STATE = useDashboardFilterStore.getState()

beforeEach(() => {
  useDashboardFilterStore.setState(INITIAL_STATE, true)
})

const savedDate: DashboardFilterRecord = {
  id: "f1",
  dashboardId: "d1",
  widgetId: null,
  filterType: "date",
  config: { from: "2026-01-01" },
  createdAt: "t",
  updatedAt: "t",
}

const savedWidgetScoped: DashboardFilterRecord = {
  id: "f2",
  dashboardId: "d1",
  widgetId: "w1",
  filterType: "layer",
  config: { layerIds: ["l1"] },
  createdAt: "t",
  updatedAt: "t",
}

describe("dashboardFilterStore", () => {
  it("setGlobalFilter adds a working filter and marks unsaved changes", () => {
    useDashboardFilterStore.getState().setGlobalFilter("date", { from: "2026-02-01" })
    const state = useDashboardFilterStore.getState()
    expect(state.activeGlobalFilters).toHaveLength(1)
    expect(state.activeGlobalFilters[0].filterType).toBe("date")
    expect(state.hasUnsavedFilterChanges).toBe(true)
  })

  it("setGlobalFilter replaces an existing filter of the same type rather than duplicating it", () => {
    useDashboardFilterStore.getState().setGlobalFilter("date", { from: "2026-01-01" })
    useDashboardFilterStore.getState().setGlobalFilter("date", { from: "2026-03-01" })
    const state = useDashboardFilterStore.getState()
    expect(state.activeGlobalFilters).toHaveLength(1)
    expect(state.activeGlobalFilters[0].config).toEqual({ from: "2026-03-01" })
  })

  it("clearGlobalFilter removes only the matching type", () => {
    useDashboardFilterStore.getState().setGlobalFilter("date", {})
    useDashboardFilterStore.getState().setGlobalFilter("layer", { layerIds: ["l1"] })
    useDashboardFilterStore.getState().clearGlobalFilter("date")

    const state = useDashboardFilterStore.getState()
    expect(state.activeGlobalFilters).toHaveLength(1)
    expect(state.activeGlobalFilters[0].filterType).toBe("layer")
  })

  it("resetToSaved repopulates from server-persisted rows, keeping only global (non-widget-scoped) filters, and clears unsaved flag", () => {
    useDashboardFilterStore.getState().setGlobalFilter("attribute", {})
    useDashboardFilterStore.getState().resetToSaved([savedDate, savedWidgetScoped])

    const state = useDashboardFilterStore.getState()
    expect(state.activeGlobalFilters).toEqual([savedDate])
    expect(state.hasUnsavedFilterChanges).toBe(false)
  })

  it("a viewer changing filters never implies dashboardBuilderStore.isEditMode (stores are independent)", async () => {
    const { useDashboardBuilderStore } = await import("../dashboardBuilderStore")
    useDashboardFilterStore.getState().setGlobalFilter("date", {})
    expect(useDashboardBuilderStore.getState().isEditMode).toBe(false)
  })

  it("is session-only: re-reading initial state after mutation shows no persisted carry-over (T119)", () => {
    useDashboardFilterStore.getState().setGlobalFilter("date", {})
    useDashboardFilterStore.setState(INITIAL_STATE, true)

    expect(useDashboardFilterStore.getState().activeGlobalFilters).toEqual([])
    expect(useDashboardFilterStore.getState().hasUnsavedFilterChanges).toBe(false)
  })
})
