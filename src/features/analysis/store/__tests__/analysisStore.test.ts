import { beforeEach, describe, expect, it } from "vitest"
import { useAnalysisStore } from "../analysisStore"

function resetStore() {
  useAnalysisStore.setState({
    selectedOperationType: null,
    draftParameters: null,
    stagedInputLayerIds: [],
    isHistoryPanelOpen: false,
    lastError: null,
    selectedPresetId: null,
    activeRunId: null,
    spatialQueryPredicate: null,
    measurementDraft: null,
  })
}

describe("useAnalysisStore", () => {
  beforeEach(() => {
    resetStore()
  })

  it("setSelectedOperationType: sets the type and clears draftParameters/selectedPresetId (clear-on-switch)", () => {
    useAnalysisStore.getState().setDraftParameters({ distance: 500 })
    useAnalysisStore.setState({ selectedPresetId: "preset-1" })

    useAnalysisStore.getState().setSelectedOperationType("buffer")

    const state = useAnalysisStore.getState()
    expect(state.selectedOperationType).toBe("buffer")
    expect(state.draftParameters).toBeNull()
    expect(state.selectedPresetId).toBeNull()
  })

  it("setDraftParameters: replaces the current draft", () => {
    useAnalysisStore.getState().setDraftParameters({ distance: 100, unit: "meters" })
    expect(useAnalysisStore.getState().draftParameters).toEqual({ distance: 100, unit: "meters" })
  })

  it("stageInputLayer/unstageInputLayer: adds and removes without duplicates", () => {
    useAnalysisStore.getState().stageInputLayer("l1")
    useAnalysisStore.getState().stageInputLayer("l1")
    useAnalysisStore.getState().stageInputLayer("l2")
    expect(useAnalysisStore.getState().stagedInputLayerIds).toEqual(["l1", "l2"])

    useAnalysisStore.getState().unstageInputLayer("l1")
    expect(useAnalysisStore.getState().stagedInputLayerIds).toEqual(["l2"])
  })

  it("clearStagedInputLayers: empties the list", () => {
    useAnalysisStore.getState().stageInputLayer("l1")
    useAnalysisStore.getState().clearStagedInputLayers()
    expect(useAnalysisStore.getState().stagedInputLayerIds).toEqual([])
  })

  it("toggleHistoryPanel: flips the flag", () => {
    expect(useAnalysisStore.getState().isHistoryPanelOpen).toBe(false)
    useAnalysisStore.getState().toggleHistoryPanel()
    expect(useAnalysisStore.getState().isHistoryPanelOpen).toBe(true)
    useAnalysisStore.getState().toggleHistoryPanel()
    expect(useAnalysisStore.getState().isHistoryPanelOpen).toBe(false)
  })

  it("setLastError/clearLastError", () => {
    useAnalysisStore.getState().setLastError("something failed")
    expect(useAnalysisStore.getState().lastError).toBe("something failed")
    useAnalysisStore.getState().clearLastError()
    expect(useAnalysisStore.getState().lastError).toBeNull()
  })

  it("setActiveRunId/clearActiveRunId", () => {
    useAnalysisStore.getState().setActiveRunId("run-1")
    expect(useAnalysisStore.getState().activeRunId).toBe("run-1")
    useAnalysisStore.getState().clearActiveRunId()
    expect(useAnalysisStore.getState().activeRunId).toBeNull()
  })

  it("setSpatialQueryPredicate", () => {
    useAnalysisStore.getState().setSpatialQueryPredicate("touches")
    expect(useAnalysisStore.getState().spatialQueryPredicate).toBe("touches")
  })

  it("setMeasurementDraft/clearMeasurementDraft", () => {
    useAnalysisStore.getState().setMeasurementDraft({ type: "distance", points: [{ lat: 0, lng: 0 }] })
    expect(useAnalysisStore.getState().measurementDraft).toEqual({ type: "distance", points: [{ lat: 0, lng: 0 }] })
    useAnalysisStore.getState().clearMeasurementDraft()
    expect(useAnalysisStore.getState().measurementDraft).toBeNull()
  })

  it("applyPreset: sets selectedPresetId/operationType/draftParameters from the preset, clearing any prior draft", () => {
    useAnalysisStore.getState().setDraftParameters({ stale: true })

    useAnalysisStore.getState().applyPreset({
      id: "preset-1",
      operationType: "buffer",
      parameters: { distance: 250, unit: "meters" },
    })

    const state = useAnalysisStore.getState()
    expect(state.selectedPresetId).toBe("preset-1")
    expect(state.selectedOperationType).toBe("buffer")
    expect(state.draftParameters).toEqual({ distance: 250, unit: "meters" })
  })

  it("clearPreset: clears only selectedPresetId", () => {
    useAnalysisStore.getState().applyPreset({ id: "preset-1", operationType: "buffer", parameters: { distance: 1 } })
    useAnalysisStore.getState().clearPreset()

    const state = useAnalysisStore.getState()
    expect(state.selectedPresetId).toBeNull()
    expect(state.selectedOperationType).toBe("buffer")
  })
})
