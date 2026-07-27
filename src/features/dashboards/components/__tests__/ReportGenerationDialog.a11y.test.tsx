import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reportService } from "../../services/reportService"
import { ReportGenerationDialog } from "../ReportGenerationDialog"
import { ScheduledReportsPanel } from "../ScheduledReportsPanel"

/**
 * Accessibility scan for the Report dialogs (T213, FR/SC-008) — same
 * `axe-core` convention and disabled-rule rationale as
 * `import-export/__tests__/a11y/axe.test.tsx` (color-contrast/region don't
 * produce meaningful results in jsdom / for an isolated component).
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

beforeEach(() => {
  vi.spyOn(reportService, "listScheduledReports").mockResolvedValue({ scheduledReports: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ReportGenerationDialog — accessibility", () => {
  it("has zero critical/serious axe violations, and every control is keyboard-reachable", async () => {
    const { container, getByRole } = render(
      <ReportGenerationDialog projectId="p1" dashboardId="d1" dashboardElement={null} />,
      { wrapper: wrapper() },
    )

    fireEvent.click(getByRole("button", { name: "Generate report" }))
    await waitFor(() => expect(getByRole("dialog")).toBeTruthy())

    const violations = await scan(container)
    const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)

    // Every format radio and the footer buttons are natively focusable
    // (native <input type="radio">/<button>), so no explicit tabIndex
    // wiring is needed for keyboard reachability here.
    expect(getByRole("radio", { name: "PDF" }).tagName).toBe("INPUT")
    expect(getByRole("button", { name: "Generate" }).tagName).toBe("BUTTON")
  })
})

describe("ScheduledReportsPanel — accessibility", () => {
  it("has zero critical/serious axe violations", async () => {
    const { container } = render(<ScheduledReportsPanel dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(container.querySelector("select")).toBeTruthy())

    const violations = await scan(container)
    const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)
  })
})
