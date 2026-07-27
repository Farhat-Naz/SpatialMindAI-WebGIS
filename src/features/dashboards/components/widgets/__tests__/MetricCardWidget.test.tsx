import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MetricCardWidget } from "../MetricCardWidget"
import type { DashboardWidgetRecord } from "../../../types/dashboard.types"

function widget(overrides: Partial<DashboardWidgetRecord> = {}): DashboardWidgetRecord {
  return {
    id: "w1",
    dashboardId: "d1",
    type: "metricCard",
    title: null,
    dataSourceType: "layerStats",
    dataSourceId: "layer-1",
    config: { statType: "featureCount", label: "Features" },
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  }
}

describe("MetricCardWidget", () => {
  it("renders the resolved value and label", () => {
    render(
      <MetricCardWidget
        widget={widget()}
        data={{ dataSourceUnavailable: false, data: { data: { featureCount: 42 } } }}
        isLoading={false}
        isEditMode={false}
      />,
    )
    expect(screen.getByText("Features")).toBeTruthy()
    expect(screen.getByText("42")).toBeTruthy()
  })

  it("renders a placeholder dash when the value is missing", () => {
    render(
      <MetricCardWidget
        widget={widget()}
        data={{ dataSourceUnavailable: false, data: { data: {} } }}
        isLoading={false}
        isEditMode={false}
      />,
    )
    expect(screen.getByText("—")).toBeTruthy()
  })
})
