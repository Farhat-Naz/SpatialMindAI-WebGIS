import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AreaChartWidget } from "../AreaChartWidget"
import { BarChartWidget } from "../BarChartWidget"
import { GaugeWidget } from "../GaugeWidget"
import { LineChartWidget } from "../LineChartWidget"
import { PieChartWidget } from "../PieChartWidget"
import type { DashboardWidgetRecord } from "../../../types/dashboard.types"

function widget(type: DashboardWidgetRecord["type"], config: Record<string, unknown> = {}): DashboardWidgetRecord {
  return {
    id: "w1",
    dashboardId: "d1",
    type,
    title: null,
    dataSourceType: "layer",
    dataSourceId: "layer-1",
    config,
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
  }
}

const featureRows = {
  dataSourceUnavailable: false as const,
  data: { data: [{ status: "active" }, { status: "active" }, { status: "closed" }] },
}

describe.each([
  ["BarChartWidget", BarChartWidget, "chartBar" as const],
  ["LineChartWidget", LineChartWidget, "chartLine" as const],
  ["AreaChartWidget", AreaChartWidget, "chartArea" as const],
  ["PieChartWidget", PieChartWidget, "chartPie" as const],
])("%s", (_name, Component, type) => {
  it("renders the chart when data is available", () => {
    const { container } = render(
      <Component widget={widget(type, { groupByAttribute: "status" })} data={featureRows} isLoading={false} isEditMode={false} />,
    )
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy()
  })

  it("the data-table fallback shows the exact same values as the chart (research.md Decision 14)", () => {
    render(
      <Component widget={widget(type, { groupByAttribute: "status" })} data={featureRows} isLoading={false} isEditMode={false} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Show data table" }))

    expect(screen.getByText("active")).toBeTruthy()
    expect(screen.getByText("closed")).toBeTruthy()
    expect(screen.getByText("2")).toBeTruthy()
    expect(screen.getByText("1")).toBeTruthy()
  })

  it("shows a no-data message when the chart has nothing to plot", () => {
    render(
      <Component widget={widget(type)} data={{ dataSourceUnavailable: false, data: { data: [] } }} isLoading={false} isEditMode={false} />,
    )
    expect(screen.getByText("No data to chart.")).toBeTruthy()
  })
})

describe("GaugeWidget", () => {
  it("clamps the displayed value within [min, max] and renders it", () => {
    render(
      <GaugeWidget
        widget={widget("gauge", { statType: "featureCount", min: 0, max: 100 })}
        data={{ dataSourceUnavailable: false, data: { data: { featureCount: 150 } } }}
        isLoading={false}
        isEditMode={false}
      />,
    )
    expect(screen.getByText("150")).toBeTruthy()
  })

  it("picks the highest applicable threshold color", () => {
    const { container } = render(
      <GaugeWidget
        widget={widget("gauge", {
          statType: "featureCount",
          min: 0,
          max: 100,
          thresholds: [
            { value: 0, color: "green" },
            { value: 80, color: "red" },
          ],
        })}
        data={{ dataSourceUnavailable: false, data: { data: { featureCount: 90 } } }}
        isLoading={false}
        isEditMode={false}
      />,
    )
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy()
  })
})
