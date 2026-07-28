import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { widgetService } from "../../services/widgetService"
import { useDashboardBuilderStore } from "../../store/dashboardBuilderStore"
import { DashboardGrid } from "../DashboardGrid"
import type { DashboardWidgetRecord, WidgetLayoutRecord } from "../../types/dashboard.types"

/**
 * T301/T314 — 100-widget dashboard: confirms research.md Decision 16's
 * viewport-gated lazy mount actually prevents all 100 widgets from
 * fetching simultaneously on open (SC-003), not just that the prop exists.
 * `vitest.setup.ts`'s global `IntersectionObserver` stub reports every
 * element intersecting immediately (so every *other* test's widgets mount
 * eagerly, matching prior behavior) — this file overrides it with one that
 * only reports a chosen subset, to exercise the non-trivial case.
 */

const VISIBLE_COUNT = 6
const TOTAL_WIDGETS = 100

class SelectiveIntersectionObserverStub {
  static visibleWidgetIds = new Set<string>()
  #callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.#callback = callback
  }

  observe(target: Element) {
    const widgetId = (target as HTMLElement).dataset.widgetId
    if (widgetId && SelectiveIntersectionObserverStub.visibleWidgetIds.has(widgetId)) {
      this.#callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      )
    }
  }

  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function widget(id: string): DashboardWidgetRecord {
  return {
    id,
    dashboardId: "d1",
    type: "metricCard",
    title: `Widget ${id}`,
    dataSourceType: "layerStats",
    dataSourceId: "layer-1",
    config: { statType: "featureCount" },
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
  }
}

function layout(widgetId: string, index: number): WidgetLayoutRecord {
  return { id: `l-${widgetId}`, widgetId, breakpoint: "desktop", x: (index % 4) * 3, y: Math.floor(index / 4) * 4, w: 3, h: 4 }
}

const INITIAL_STORE_STATE = useDashboardBuilderStore.getState()

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_STORE_STATE, true)
  vi.spyOn(widgetService, "getWidgetData").mockResolvedValue({ dataSourceUnavailable: false, data: { data: { featureCount: 1 } } })

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub)

  SelectiveIntersectionObserverStub.visibleWidgetIds = new Set(
    Array.from({ length: VISIBLE_COUNT }, (_, index) => `w${index}`),
  )
  vi.stubGlobal("IntersectionObserver", SelectiveIntersectionObserverStub)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("DashboardGrid — 100-widget performance", () => {
  it("only fetches data for widgets that have actually intersected the viewport, not all 100 (SC-003)", async () => {
    const widgets = Array.from({ length: TOTAL_WIDGETS }, (_, index) => widget(`w${index}`))
    const layouts = widgets.map((w, index) => layout(w.id, index))

    const startedAt = performance.now()
    render(<DashboardGrid dashboardId="d1" widgets={widgets} layouts={layouts} activeBreakpoint="desktop" canEdit={false} />, {
      wrapper: wrapper(),
    })
    const renderDurationMs = performance.now() - startedAt

    await waitFor(() => expect(widgetService.getWidgetData).toHaveBeenCalledTimes(VISIBLE_COUNT))

    // A generous smoke-test budget — this asserts initial render doesn't
    // scale linearly with "every widget fetches on mount", not a precise
    // perf benchmark (those vary too much across CI hardware).
    expect(renderDurationMs).toBeLessThan(3000)

    const fetchedWidgetIds = vi.mocked(widgetService.getWidgetData).mock.calls.map(([, widgetId]) => widgetId)
    for (let index = 0; index < VISIBLE_COUNT; index += 1) {
      expect(fetchedWidgetIds).toContain(`w${index}`)
    }
    for (let index = VISIBLE_COUNT; index < TOTAL_WIDGETS; index += 1) {
      expect(fetchedWidgetIds).not.toContain(`w${index}`)
    }
  })
})
