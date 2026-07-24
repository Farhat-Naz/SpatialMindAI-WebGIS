import { beforeEach, describe, expect, it } from "vitest"
import { useEditingStore } from "../store/editingStore"

function resetStore() {
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
}

const point = { type: "Point" as const, coordinates: [1, 2] as [number, number] }

describe("useEditingStore", () => {
  beforeEach(() => {
    resetStore()
  })

  describe("tool switching", () => {
    it("clears draftGeometry and measurementResult when a new tool is activated", () => {
      useEditingStore.getState().setDraftGeometry(point, "l1")
      useEditingStore.getState().setMeasurementResult({ value: 10, unit: "distance" })

      useEditingStore.getState().setTool("draw-line")

      const state = useEditingStore.getState()
      expect(state.tool).toBe("draw-line")
      expect(state.draftGeometry).toBeNull()
      expect(state.measurementResult).toBeNull()
    })
  })

  describe("cancelDraft", () => {
    it("clears the draft and tool with no side effects", () => {
      useEditingStore.getState().setTool("draw-polygon")
      useEditingStore.getState().setDraftGeometry(point, "l1", "f1")

      useEditingStore.getState().cancelDraft()

      const state = useEditingStore.getState()
      expect(state.draftGeometry).toBeNull()
      expect(state.targetLayerId).toBeNull()
      expect(state.targetFeatureId).toBeNull()
      expect(state.tool).toBeNull()
    })
  })

  describe("undo snapshot", () => {
    it("sets and clears the snapshot", () => {
      useEditingStore.getState().setUndoSnapshot({
        kind: "geometry",
        featureId: "f1",
        previousValue: point,
      })
      expect(useEditingStore.getState().undoSnapshot).not.toBeNull()

      useEditingStore.getState().clearUndoSnapshot()
      expect(useEditingStore.getState().undoSnapshot).toBeNull()
    })
  })

  describe("layer lock", () => {
    it("locks and unlocks independently per layer", () => {
      useEditingStore.getState().lockLayer("l1")
      expect(useEditingStore.getState().isLayerLocked("l1")).toBe(true)
      expect(useEditingStore.getState().isLayerLocked("l2")).toBe(false)

      useEditingStore.getState().unlockLayer("l1")
      expect(useEditingStore.getState().isLayerLocked("l1")).toBe(false)
    })
  })

  describe("layer display (visibility/opacity)", () => {
    it("defaults to visible and fully opaque", () => {
      expect(useEditingStore.getState().getLayerDisplay("unknown-layer")).toEqual({
        visible: true,
        opacity: 1,
      })
    })

    it("tracks visibility and opacity independently per layer", () => {
      useEditingStore.getState().setLayerVisibility("l1", false)
      useEditingStore.getState().setLayerOpacity("l1", 0.5)

      expect(useEditingStore.getState().getLayerDisplay("l1")).toEqual({
        visible: false,
        opacity: 0.5,
      })
      expect(useEditingStore.getState().getLayerDisplay("l2")).toEqual({
        visible: true,
        opacity: 1,
      })
    })
  })

  describe("clipboard", () => {
    it("holds at most one entry, replaced by the next copy", () => {
      useEditingStore.getState().copyFeature({ geometry: point, attributes: [], style: null })
      useEditingStore.getState().copyFeature({
        geometry: { type: "Point", coordinates: [9, 9] },
        attributes: [{ key: "a", value: "b" }],
        style: null,
      })

      expect(useEditingStore.getState().clipboard?.geometry).toEqual({
        type: "Point",
        coordinates: [9, 9],
      })
    })
  })

  describe("lastError", () => {
    it("sets and clears the error message", () => {
      useEditingStore.getState().setLastError("Something went wrong.")
      expect(useEditingStore.getState().lastError).toBe("Something went wrong.")

      useEditingStore.getState().clearLastError()
      expect(useEditingStore.getState().lastError).toBeNull()
    })
  })

  describe("draft geometry", () => {
    it("sets the draft geometry along with its target layer/feature", () => {
      useEditingStore.getState().setDraftGeometry(point, "l1", "f1")

      const state = useEditingStore.getState()
      expect(state.draftGeometry).toEqual(point)
      expect(state.targetLayerId).toBe("l1")
      expect(state.targetFeatureId).toBe("f1")
    })

    it("defaults targetLayerId/targetFeatureId to null when omitted", () => {
      useEditingStore.getState().setDraftGeometry(point)

      const state = useEditingStore.getState()
      expect(state.targetLayerId).toBeNull()
      expect(state.targetFeatureId).toBeNull()
    })
  })

  describe("measurement result", () => {
    it("sets and clears the measurement result", () => {
      useEditingStore.getState().setMeasurementResult({ value: 42, unit: "area" })
      expect(useEditingStore.getState().measurementResult).toEqual({ value: 42, unit: "area" })

      useEditingStore.getState().setMeasurementResult(null)
      expect(useEditingStore.getState().measurementResult).toBeNull()
    })
  })

  describe("import result", () => {
    it("sets and clears the import result", () => {
      useEditingStore.getState().setImportResult({ status: "success", importedCount: 3 })
      expect(useEditingStore.getState().importResult).toEqual({ status: "success", importedCount: 3 })

      useEditingStore.getState().clearImportResult()
      expect(useEditingStore.getState().importResult).toBeNull()
    })
  })

  describe("context menu target", () => {
    it("sets and clears the pending context-menu target", () => {
      useEditingStore.getState().setContextMenuTarget({ kind: "feature", id: "f1", clientX: 5, clientY: 6 })
      expect(useEditingStore.getState().contextMenuTarget).toEqual({
        kind: "feature",
        id: "f1",
        clientX: 5,
        clientY: 6,
      })

      useEditingStore.getState().clearContextMenuTarget()
      expect(useEditingStore.getState().contextMenuTarget).toBeNull()
    })
  })
})
