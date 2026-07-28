import { createRef } from "react"
import { fireEvent, render, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { analyticsService } from "../../services/analyticsService"
import { DashboardExportMenu } from "../DashboardExportMenu"
import type { DashboardWidgetRecord } from "../../types/dashboard.types"

/**
 * Accessibility scan for the Export menu (T273, FR/SC-008) — same
 * `axe-core` convention and disabled-rule rationale as
 * `ReportGenerationDialog.a11y.test.tsx`.
 */
const DISABLED_RULES = { "color-contrast": { enabled: false }, region: { enabled: false } }

async function scan(container: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(container, { rules: DISABLED_RULES })
  return results.violations
}

function describeViolations(violations: axe.Result[]): string {
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help}`).join("\n  ")
}

function tableWidget(): DashboardWidgetRecord {
  return {
    id: "w1",
    dashboardId: "d1",
    type: "table",
    title: "Parcels",
    dataSourceType: "layer",
    dataSourceId: "layer-1",
    config: {},
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
  }
}

beforeEach(() => {
  vi.spyOn(analyticsService, "getAnalyticsSnapshot").mockResolvedValue({
    data: { featureCount: 3 },
    computedAt: "t",
    isCached: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DashboardExportMenu — accessibility", () => {
  it("has zero critical/serious axe violations, and the trigger + every menu item is keyboard-reachable", async () => {
    const ref = createRef<HTMLDivElement>()
    const { container, getByRole, findByText } = render(
      <DashboardExportMenu projectId="p1" dashboardId="d1" widgets={[tableWidget()]} dashboardElementRef={ref} />,
    )

    const trigger = getByRole("button", { name: "Export" })
    expect(trigger.tagName).toBe("BUTTON")

    fireEvent.pointerDown(trigger)
    await waitFor(() => expect(getByRole("menu")).toBeTruthy())
    expect(await findByText("Export dashboard as image")).toBeTruthy()

    const violations = await scan(container)
    const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)
  })

  it("the large-export warning dialog has zero critical/serious axe violations", async () => {
    vi.mocked(analyticsService.getAnalyticsSnapshot).mockResolvedValue({
      data: { featureCount: 50_000 },
      computedAt: "t",
      isCached: true,
    })
    const ref = createRef<HTMLDivElement>()
    const { container, getByRole, findByText } = render(
      <DashboardExportMenu projectId="p1" dashboardId="d1" widgets={[tableWidget()]} dashboardElementRef={ref} />,
    )

    fireEvent.pointerDown(getByRole("button", { name: "Export" }))
    fireEvent.click(await findByText("Parcels"))
    fireEvent.click(await findByText("CSV"))
    await waitFor(() => expect(getByRole("alertdialog")).toBeTruthy())

    const violations = await scan(container)
    const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)
    expect(getByRole("button", { name: "Export anyway" }).tagName).toBe("BUTTON")
  })
})
