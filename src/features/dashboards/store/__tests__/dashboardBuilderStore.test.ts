import { beforeEach, describe, expect, it } from "vitest"
import { useDashboardBuilderStore } from "../dashboardBuilderStore"

const INITIAL_STATE = useDashboardBuilderStore.getState()

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_STATE, true)
})

describe("dashboardBuilderStore", () => {
  it("selectWidget seeds the draft from the widget's current config", () => {
    useDashboardBuilderStore.getState().selectWidget("w1", { statType: "featureCount" })
    expect(useDashboardBuilderStore.getState().selectedWidgetId).toBe("w1")
    expect(useDashboardBuilderStore.getState().draftWidgetConfig).toEqual({ statType: "featureCount" })
  })

  it("selectWidget clears any unsaved draft from the previous selection when switching widgets", () => {
    useDashboardBuilderStore.getState().selectWidget("w1", { a: 1 })
    useDashboardBuilderStore.getState().setDraftWidgetConfig({ a: 1, unsavedEdit: true })
    useDashboardBuilderStore.getState().selectWidget("w2", { b: 2 })

    expect(useDashboardBuilderStore.getState().selectedWidgetId).toBe("w2")
    expect(useDashboardBuilderStore.getState().draftWidgetConfig).toEqual({ b: 2 })
  })

  it("clearSelectedWidget clears both selection and draft", () => {
    useDashboardBuilderStore.getState().selectWidget("w1", { a: 1 })
    useDashboardBuilderStore.getState().clearSelectedWidget()
    expect(useDashboardBuilderStore.getState().selectedWidgetId).toBeNull()
    expect(useDashboardBuilderStore.getState().draftWidgetConfig).toBeNull()
  })

  it("setDraftWidgetConfig updates the draft without touching selection", () => {
    useDashboardBuilderStore.getState().selectWidget("w1", { a: 1 })
    useDashboardBuilderStore.getState().setDraftWidgetConfig({ a: 2 })
    expect(useDashboardBuilderStore.getState().selectedWidgetId).toBe("w1")
    expect(useDashboardBuilderStore.getState().draftWidgetConfig).toEqual({ a: 2 })
  })

  it("toggleEditMode flips isEditMode", () => {
    expect(useDashboardBuilderStore.getState().isEditMode).toBe(false)
    useDashboardBuilderStore.getState().toggleEditMode()
    expect(useDashboardBuilderStore.getState().isEditMode).toBe(true)
    useDashboardBuilderStore.getState().toggleEditMode()
    expect(useDashboardBuilderStore.getState().isEditMode).toBe(false)
  })

  it("setActiveBreakpoint overrides the detected default", () => {
    useDashboardBuilderStore.getState().setActiveBreakpoint("mobile")
    expect(useDashboardBuilderStore.getState().activeBreakpoint).toBe("mobile")
  })

  it("setLastError/clearLastError", () => {
    useDashboardBuilderStore.getState().setLastError("Something failed.")
    expect(useDashboardBuilderStore.getState().lastError).toBe("Something failed.")
    useDashboardBuilderStore.getState().clearLastError()
    expect(useDashboardBuilderStore.getState().lastError).toBeNull()
  })

  it("is session-only: re-reading initial state after mutation shows no persisted carry-over (T119)", () => {
    useDashboardBuilderStore.getState().selectWidget("w1", { a: 1 })
    useDashboardBuilderStore.getState().setLastError("boom")

    useDashboardBuilderStore.setState(INITIAL_STATE, true)

    expect(useDashboardBuilderStore.getState().selectedWidgetId).toBeNull()
    expect(useDashboardBuilderStore.getState().lastError).toBeNull()
  })
})
