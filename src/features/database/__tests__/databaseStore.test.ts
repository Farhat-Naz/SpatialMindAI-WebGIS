import { beforeEach, describe, expect, it } from "vitest"
import { useDatabaseStore } from "../store/databaseStore"

function resetStore() {
  useDatabaseStore.setState({
    selectedProjectId: null,
    selectedLayerId: null,
    selectedFeatureId: null,
    selectedFeatureIds: [],
  })
}

describe("useDatabaseStore", () => {
  beforeEach(() => {
    resetStore()
  })

  it("selects a project", () => {
    useDatabaseStore.getState().selectProject("p1")
    expect(useDatabaseStore.getState().selectedProjectId).toBe("p1")
  })

  it("clears the dependent layer and feature selection when a new project is selected", () => {
    useDatabaseStore.getState().selectProject("p1")
    useDatabaseStore.getState().selectLayer("l1")
    useDatabaseStore.getState().selectFeature("f1")

    useDatabaseStore.getState().selectProject("p2")

    const state = useDatabaseStore.getState()
    expect(state.selectedProjectId).toBe("p2")
    expect(state.selectedLayerId).toBeNull()
    expect(state.selectedFeatureId).toBeNull()
  })

  it("clears the dependent feature selection when a new layer is selected", () => {
    useDatabaseStore.getState().selectLayer("l1")
    useDatabaseStore.getState().selectFeature("f1")

    useDatabaseStore.getState().selectLayer("l2")

    const state = useDatabaseStore.getState()
    expect(state.selectedLayerId).toBe("l2")
    expect(state.selectedFeatureId).toBeNull()
  })

  it("clears all selection state", () => {
    useDatabaseStore.getState().selectProject("p1")
    useDatabaseStore.getState().selectLayer("l1")
    useDatabaseStore.getState().selectFeature("f1")

    useDatabaseStore.getState().clearSelection()

    const state = useDatabaseStore.getState()
    expect(state.selectedProjectId).toBeNull()
    expect(state.selectedLayerId).toBeNull()
    expect(state.selectedFeatureId).toBeNull()
  })

  describe("multi-selection (US5)", () => {
    it("adds a feature to the multi-selection on toggle", () => {
      useDatabaseStore.getState().toggleFeatureSelection("f1")

      const state = useDatabaseStore.getState()
      expect(state.selectedFeatureIds).toEqual(["f1"])
      expect(state.selectedFeatureId).toBe("f1")
    })

    it("removes a feature from the multi-selection when toggled again", () => {
      useDatabaseStore.getState().toggleFeatureSelection("f1")
      useDatabaseStore.getState().toggleFeatureSelection("f2")
      useDatabaseStore.getState().toggleFeatureSelection("f1")

      const state = useDatabaseStore.getState()
      expect(state.selectedFeatureIds).toEqual(["f2"])
      expect(state.selectedFeatureId).toBe("f2")
    })

    it("keeps selectedFeatureId in sync as the most recently toggled-on id", () => {
      useDatabaseStore.getState().toggleFeatureSelection("f1")
      useDatabaseStore.getState().toggleFeatureSelection("f2")

      expect(useDatabaseStore.getState().selectedFeatureId).toBe("f2")
    })

    it("replaces the multi-selection wholesale via selectFeatureRange", () => {
      useDatabaseStore.getState().toggleFeatureSelection("f1")

      useDatabaseStore.getState().selectFeatureRange(["f2", "f3", "f4"])

      const state = useDatabaseStore.getState()
      expect(state.selectedFeatureIds).toEqual(["f2", "f3", "f4"])
      expect(state.selectedFeatureId).toBe("f4")
    })

    it("clears only the multi-selection, leaving project/layer selection intact", () => {
      useDatabaseStore.getState().selectProject("p1")
      useDatabaseStore.getState().selectLayer("l1")
      useDatabaseStore.getState().selectFeatureRange(["f1", "f2"])

      useDatabaseStore.getState().clearFeatureSelection()

      const state = useDatabaseStore.getState()
      expect(state.selectedFeatureIds).toEqual([])
      expect(state.selectedFeatureId).toBeNull()
      expect(state.selectedProjectId).toBe("p1")
      expect(state.selectedLayerId).toBe("l1")
    })

    it("resets the multi-selection when a single feature is selected directly", () => {
      useDatabaseStore.getState().selectFeatureRange(["f1", "f2"])

      useDatabaseStore.getState().selectFeature("f3")

      const state = useDatabaseStore.getState()
      expect(state.selectedFeatureIds).toEqual(["f3"])
      expect(state.selectedFeatureId).toBe("f3")
    })
  })
})
