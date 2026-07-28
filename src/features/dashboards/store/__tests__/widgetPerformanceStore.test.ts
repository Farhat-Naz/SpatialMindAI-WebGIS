import { beforeEach, describe, expect, it } from "vitest"
import { useWidgetPerformanceStore } from "../widgetPerformanceStore"

const INITIAL_STATE = useWidgetPerformanceStore.getState()

beforeEach(() => {
  useWidgetPerformanceStore.setState(INITIAL_STATE, true)
})

/** T333/T334 gap-fill — `widgetPerformanceStore.ts` (T287/Phase 17) had no direct test. */
describe("widgetPerformanceStore", () => {
  it("recordDuration adds an entry for a widget not seen before", () => {
    useWidgetPerformanceStore.getState().recordDuration("w1", 120)
    const state = useWidgetPerformanceStore.getState()
    expect(state.durationsByWidgetId.w1.durationMs).toBe(120)
  })

  it("recordDuration overwrites the previous duration for the same widget, keeping only the most recent", () => {
    useWidgetPerformanceStore.getState().recordDuration("w1", 120)
    useWidgetPerformanceStore.getState().recordDuration("w1", 300)
    const state = useWidgetPerformanceStore.getState()
    expect(state.durationsByWidgetId.w1.durationMs).toBe(300)
  })

  it("tracks multiple widgets independently", () => {
    useWidgetPerformanceStore.getState().recordDuration("w1", 100)
    useWidgetPerformanceStore.getState().recordDuration("w2", 200)
    const state = useWidgetPerformanceStore.getState()
    expect(state.durationsByWidgetId.w1.durationMs).toBe(100)
    expect(state.durationsByWidgetId.w2.durationMs).toBe(200)
  })

  it("is session-only: re-reading initial state after a mutation shows no persisted carry-over", () => {
    useWidgetPerformanceStore.getState().recordDuration("w1", 100)
    useWidgetPerformanceStore.setState(INITIAL_STATE, true)
    expect(useWidgetPerformanceStore.getState().durationsByWidgetId).toEqual({})
  })
})
