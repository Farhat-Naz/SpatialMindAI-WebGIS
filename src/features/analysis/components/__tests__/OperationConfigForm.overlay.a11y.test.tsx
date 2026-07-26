import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OperationConfigForm } from "../OperationConfigForm"
import { useAnalysisStore } from "../../store/analysisStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: { runAnalysis: vi.fn() },
}))

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
  featureService: { list: vi.fn().mockResolvedValue({ features: [], nextCursor: null }) },
  useDatabaseStore: (selector: (state: unknown) => unknown) =>
    selector({ selectLayer: vi.fn(), selectFeatureRange: vi.fn() }),
}))

/**
 * T181 (US4 accessibility check) — keyboard traversal and accessible-name
 * assertions for the Overlay form, following the same convention as
 * T135's Buffer a11y test: a full automated axe scan is deferred to
 * Phase 18 (Accessibility), which introduces that tooling project-wide in
 * one pass. This test covers FR-037/FR-038's concrete, checkable parts —
 * every control has an accessible name, is reachable in natural tab order,
 * and validation errors are announced.
 */
function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

const OVERLAY_TITLES = [
  ["union", "Union"],
  ["intersect", "Intersection"],
  ["difference", "Difference"],
  ["clip", "Clip"],
  ["erase", "Erase"],
  ["identity", "Identity"],
  ["symmetricalDifference", "Symmetrical Difference"],
] as const

describe("OperationConfigForm — Overlay accessibility", () => {
  beforeEach(() => {
    useAnalysisStore.setState({ selectedOperationType: "clip", stagedInputLayerIds: ["a", "b"] })
  })

  it.each(OVERLAY_TITLES)("%s exposes the form and its submit control by accessible name", (operationType, title) => {
    useAnalysisStore.setState({ selectedOperationType: operationType, stagedInputLayerIds: ["a", "b"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    expect(screen.getByRole("form", { name: new RegExp(`${title} parameters`, "i") })).toBeTruthy()
    expect(screen.getByRole("button", { name: new RegExp(`run ${title}`, "i") })).toBeTruthy()
  })

  it("the submit button is the only focusable control and opts into natural tab order", () => {
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    const form = screen.getByRole("form", { name: /clip parameters/i })
    const focusable = Array.from(form.querySelectorAll("input, select, button, textarea, [href]"))
    expect(focusable).toEqual([screen.getByRole("button", { name: /run clip/i })])
    // No positive-tabindex hacks anywhere in the form.
    for (const element of focusable) {
      expect(element.hasAttribute("tabindex")).toBe(false)
    }
  })

  it("the submit control is reachable and operable by keyboard", () => {
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })
    const submit = screen.getByRole("button", { name: /run clip/i }) as HTMLButtonElement

    submit.focus()
    expect(document.activeElement).toBe(submit)
    expect(submit.disabled).toBe(false)
    expect(submit.getAttribute("type")).toBe("submit")
  })

  it("a validation error is announced via role=alert", () => {
    useAnalysisStore.setState({ selectedOperationType: "clip", stagedInputLayerIds: [] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    expect(screen.queryByRole("alert")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /run clip/i }))

    const alert = screen.getByRole("alert")
    expect(alert.textContent).toMatch(/select two layers/i)
    // The message names both input roles so a screen-reader user knows
    // which two layers to stage, not merely that something is missing.
    expect(alert.textContent).toMatch(/target layer/i)
    expect(alert.textContent).toMatch(/clip boundary/i)
  })

  it("the staged-layer summary states which staged slot is still empty", () => {
    useAnalysisStore.setState({ selectedOperationType: "clip", stagedInputLayerIds: ["only-a"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    expect(screen.getByText(/clip boundary: not staged/i)).toBeTruthy()
  })
})
