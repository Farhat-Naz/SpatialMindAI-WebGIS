import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { widgetService } from "../services/widgetService"
import { WidgetRenderer } from "../components/WidgetRenderer"
import { WIDGET_REFRESH_INTERVAL_MS } from "../types/dashboardConfig.constants"
import type { DashboardWidgetRecord } from "../types/dashboard.types"

/**
 * Full Live Analytics flow (quickstart.md §4; spec.md US4 Acceptance
 * Scenarios 1–5), including the SC-002 30-second refresh bound via mocked
 * timers.
 */

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
    type: "metricCard",
    title: "Feature Count",
    dataSourceType: "layerStats",
    dataSourceId: "layer-1",
    config: { statType: "featureCount" },
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("Live Analytics — Scenarios 1-3 (Metric Card / Statistics / Gauge live refresh)", () => {
  it("Scenario 1: a Metric Card widget updates within the refresh bound when the underlying data changes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const dataSpy = vi
      .spyOn(widgetService, "getWidgetData")
      .mockResolvedValueOnce({ dataSourceUnavailable: false, data: { data: { featureCount: 10 } } })
      .mockResolvedValue({ dataSourceUnavailable: false, data: { data: { featureCount: 25 } } })

    render(<WidgetRenderer dashboardId="d1" widget={widget()} canEdit={false} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("10")).toBeTruthy())

    await vi.advanceTimersByTimeAsync(WIDGET_REFRESH_INTERVAL_MS + 1000)

    await waitFor(() => expect(screen.getByText("25")).toBeTruthy())
    expect(dataSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

describe("Live Analytics — Scenario 4 (User Activity widget)", () => {
  it("renders the resolved Activity feed via dataSourceType: activity", async () => {
    vi.spyOn(widgetService, "getWidgetData").mockResolvedValue({
      dataSourceUnavailable: false,
      data: { activities: [{ id: "a1", action: "create", targetType: "layer", createdAt: "2026-01-01T00:00:00.000Z" }] },
    })

    render(
      <WidgetRenderer
        dashboardId="d1"
        widget={widget({ type: "table", dataSourceType: "activity", dataSourceId: null, config: {} })}
        canEdit={false}
      />,
      { wrapper: wrapper() },
    )

    await waitFor(() => expect(screen.getByText(/create layer/)).toBeTruthy())
  })
})

describe("Live Analytics — Scenario 5 (System/Storage widget, any project member)", () => {
  it("renders platform-scoped counts via dataSourceType: systemStats", async () => {
    vi.spyOn(widgetService, "getWidgetData").mockResolvedValue({
      dataSourceUnavailable: false,
      data: { data: { dashboardCount: 3, widgetCount: 12 } },
    })

    render(
      <WidgetRenderer
        dashboardId="d1"
        widget={widget({ type: "statistics", dataSourceType: "systemStats", dataSourceId: null, config: {} })}
        canEdit={false}
      />,
      { wrapper: wrapper() },
    )

    await waitFor(() => expect(screen.getByText("dashboardCount")).toBeTruthy())
    expect(screen.getByText("widgetCount")).toBeTruthy()
  })
})
