import { beforeEach, describe, expect, it } from "vitest"
import { useAnalysisPanelStore } from "../analysisPanelStore"

function resetStore() {
  useAnalysisPanelStore.setState({
    isPanelOpen: false,
    dockPosition: "right",
    panelWidth: 360,
    activeTab: "toolbox",
    selectedHistoryRunId: null,
  })
  localStorage.clear()
}

describe("useAnalysisPanelStore", () => {
  beforeEach(() => {
    resetStore()
  })

  it("openPanel/closePanel/togglePanel", () => {
    useAnalysisPanelStore.getState().openPanel()
    expect(useAnalysisPanelStore.getState().isPanelOpen).toBe(true)

    useAnalysisPanelStore.getState().closePanel()
    expect(useAnalysisPanelStore.getState().isPanelOpen).toBe(false)

    useAnalysisPanelStore.getState().togglePanel()
    expect(useAnalysisPanelStore.getState().isPanelOpen).toBe(true)
  })

  it("setDockPosition", () => {
    useAnalysisPanelStore.getState().setDockPosition("floating")
    expect(useAnalysisPanelStore.getState().dockPosition).toBe("floating")
  })

  it("setPanelWidth", () => {
    useAnalysisPanelStore.getState().setPanelWidth(420)
    expect(useAnalysisPanelStore.getState().panelWidth).toBe(420)
  })

  it("setActiveTab", () => {
    useAnalysisPanelStore.getState().setActiveTab("history")
    expect(useAnalysisPanelStore.getState().activeTab).toBe("history")
  })

  it("selectHistoryRun", () => {
    useAnalysisPanelStore.getState().selectHistoryRun("run-1")
    expect(useAnalysisPanelStore.getState().selectedHistoryRunId).toBe("run-1")
    useAnalysisPanelStore.getState().selectHistoryRun(null)
    expect(useAnalysisPanelStore.getState().selectedHistoryRunId).toBeNull()
  })

  describe("persistence (T115/T116/T119)", () => {
    it("persists dockPosition and panelWidth to localStorage", () => {
      useAnalysisPanelStore.getState().setDockPosition("left")
      useAnalysisPanelStore.getState().setPanelWidth(500)

      const raw = localStorage.getItem("spatialMind:analysisPanel")
      expect(raw).not.toBeNull()
      const persisted = JSON.parse(raw!)
      expect(persisted.state.dockPosition).toBe("left")
      expect(persisted.state.panelWidth).toBe(500)
    })

    it("does not persist isPanelOpen, activeTab, or selectedHistoryRunId (session-only chrome state)", () => {
      useAnalysisPanelStore.getState().openPanel()
      useAnalysisPanelStore.getState().setActiveTab("result")
      useAnalysisPanelStore.getState().selectHistoryRun("run-1")
      useAnalysisPanelStore.getState().setDockPosition("left")

      const raw = localStorage.getItem("spatialMind:analysisPanel")
      const persisted = JSON.parse(raw!)
      expect(persisted.state).not.toHaveProperty("isPanelOpen")
      expect(persisted.state).not.toHaveProperty("activeTab")
      expect(persisted.state).not.toHaveProperty("selectedHistoryRunId")
    })
  })
})
