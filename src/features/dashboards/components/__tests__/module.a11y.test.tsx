import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../../services/dashboardService"
import { dashboardFilterService } from "../../services/dashboardFilterService"
import { useLayers } from "@/features/database/hooks/useLayers"
import { useAnalysisRuns } from "@/features/analysis/hooks/useAnalysis"
import { useDashboardBuilderStore } from "../../store/dashboardBuilderStore"
import { useDashboardFilterStore } from "../../store/dashboardFilterStore"
import { CreateDashboardDialog } from "../CreateDashboardDialog"
import { DashboardFilterBar } from "../DashboardFilterBar"
import { WidgetConfigPanel } from "../WidgetConfigPanel"
import { WidgetRenderer } from "../WidgetRenderer"
import { widgetService } from "../../services/widgetService"
import type { DashboardWidgetRecord } from "../../types/dashboard.types"

/**
 * T321 — one consolidated automated axe scan across every dialog/panel/
 * widget type not already covered by an earlier phase's own a11y test
 * (`ReportGenerationDialog.a11y.test.tsx`, `DashboardExportMenu.a11y.test.tsx`,
 * `DashboardView.a11y.test.tsx`) — consolidating T316–T320's per-area
 * checks into one final confirmation, same `axe-core` convention throughout.
 */
const DISABLED_RULES = { "color-contrast": { enabled: false }, region: { enabled: false } }

async function scan(container: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(container, { rules: DISABLED_RULES })
  return results.violations
}

function describeViolations(violations: axe.Result[]): string {
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help}`).join("\n  ")
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function chartWidget(type: DashboardWidgetRecord["type"]): DashboardWidgetRecord {
  return {
    id: `w-${type}`,
    dashboardId: "d1",
    type,
    title: `${type} widget`,
    dataSourceType: "layer",
    dataSourceId: "layer-1",
    config: { groupByAttribute: "status" },
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
  }
}

vi.mock("@/features/database/hooks/useLayers", () => ({ useLayers: vi.fn() }))
vi.mock("@/features/analysis/hooks/useAnalysis", () => ({ useAnalysisRuns: vi.fn() }))

const INITIAL_BUILDER_STATE = useDashboardBuilderStore.getState()
const INITIAL_FILTER_STATE = useDashboardFilterStore.getState()

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_BUILDER_STATE, true)
  useDashboardFilterStore.setState(INITIAL_FILTER_STATE, true)
  vi.mocked(useLayers).mockReturnValue({ data: [{ id: "layer-1", name: "Parcels" }] } as never)
  vi.mocked(useAnalysisRuns).mockReturnValue({ data: { runs: [] } } as never)
  vi.spyOn(dashboardFilterService, "listFilters").mockResolvedValue({ filters: [] })
  vi.spyOn(widgetService, "getWidgetData").mockResolvedValue({
    dataSourceUnavailable: false,
    data: { features: [{ id: "f1", attributes: [{ key: "status", value: "open" }] }] },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("module a11y — CreateDashboardDialog + embedded TemplatePicker", () => {
  it("has zero critical/serious axe violations with the dialog open", async () => {
    vi.spyOn(dashboardService, "listTemplates").mockResolvedValue({
      templates: [
        { id: "t1", key: "executive", name: "Executive", description: null, widgetsBlueprint: [], createdAt: "t", updatedAt: "t" },
      ],
    })
    const { container, getByRole } = render(<CreateDashboardDialog projectId="p1" onCreated={vi.fn()} />, { wrapper: wrapper() })

    fireEvent.click(getByRole("button", { name: "New dashboard" }))
    await waitFor(() => expect(getByRole("dialog")).toBeTruthy())

    const violations = await scan(container)
    const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)
  })
})

describe("module a11y — WidgetConfigPanel (edit mode, attribute filter section)", () => {
  it("has zero critical/serious axe violations", async () => {
    useDashboardBuilderStore.getState().selectWidget("w1", chartWidget("table").config as Record<string, unknown>, "table")
    const { container } = render(
      <WidgetConfigPanel projectId="p1" dashboardId="d1" open={true} onOpenChange={vi.fn()} />,
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(screen.getByLabelText("Attribute key")).toBeTruthy())

    const violations = await scan(container)
    const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)
  })
})

describe("module a11y — DashboardFilterBar", () => {
  it("has zero critical/serious axe violations", async () => {
    const { container } = render(<DashboardFilterBar projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByLabelText("From")).toBeTruthy())

    const violations = await scan(container)
    const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)
  })
})

describe("module a11y — chart widgets (T320's data-table fallback + chrome)", () => {
  it.each(["chartBar", "chartLine", "chartArea", "chartPie", "gauge"] as const)(
    "%s: has zero critical/serious axe violations, including the data-table fallback toggle",
    async (type) => {
      const { container, queryByRole } = render(
        <WidgetRenderer dashboardId="d1" widget={chartWidget(type)} canEdit={false} />,
        { wrapper: wrapper() },
      )
      await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull())

      const violations = await scan(container)
      const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
      expect(serious, describeViolations(serious)).toHaveLength(0)

      // T320 — the accessible data-table fallback toggle, where the widget type has one.
      const tableToggle = queryByRole("button", { name: "Show data table" })
      if (tableToggle) {
        fireEvent.click(tableToggle)
        const violationsWithTable = await scan(container)
        const seriousWithTable = violationsWithTable.filter((v) => v.impact === "critical" || v.impact === "serious")
        expect(seriousWithTable, describeViolations(seriousWithTable)).toHaveLength(0)
      }
    },
  )
})
