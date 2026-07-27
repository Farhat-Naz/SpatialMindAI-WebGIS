import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StatisticsWidget } from "../StatisticsWidget"
import type { DashboardWidgetRecord } from "../../../types/dashboard.types"

function widget(): DashboardWidgetRecord {
  return {
    id: "w1",
    dashboardId: "d1",
    type: "statistics",
    title: null,
    dataSourceType: "layerStats",
    dataSourceId: "layer-1",
    config: {},
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
  }
}

describe("StatisticsWidget", () => {
  it("renders every scalar key from the resolved snapshot", () => {
    render(
      <StatisticsWidget
        widget={widget()}
        data={{ dataSourceUnavailable: false, data: { data: { featureCount: 10, totalAreaSquareMeters: 250.5 } } }}
        isLoading={false}
        isEditMode={false}
      />,
    )
    expect(screen.getByText("featureCount")).toBeTruthy()
    expect(screen.getByText("10")).toBeTruthy()
    expect(screen.getByText("totalAreaSquareMeters")).toBeTruthy()
    expect(screen.getByText("250.50")).toBeTruthy()
  })

  it("omits non-scalar keys (e.g. arrays/objects)", () => {
    render(
      <StatisticsWidget
        widget={widget()}
        data={{
          dataSourceUnavailable: false,
          data: { data: { featureCount: 5, geometryTypes: ["Point"], boundingBox: { type: "Polygon" } } },
        }}
        isLoading={false}
        isEditMode={false}
      />,
    )
    expect(screen.getByText("featureCount")).toBeTruthy()
    expect(screen.queryByText("geometryTypes")).toBeNull()
    expect(screen.queryByText("boundingBox")).toBeNull()
  })

  it("renders nothing when the data source is unavailable", () => {
    const { container } = render(
      <StatisticsWidget widget={widget()} data={{ dataSourceUnavailable: true }} isLoading={false} isEditMode={false} />,
    )
    expect(container.textContent).toBe("")
  })
})
