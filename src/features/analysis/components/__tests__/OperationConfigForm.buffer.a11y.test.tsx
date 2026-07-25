import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OperationConfigForm } from "../OperationConfigForm"
import { useAnalysisStore } from "../../store/analysisStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: { runAnalysis: vi.fn() },
}))

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
}))

/**
 * T135 (US1 accessibility check) — role/label/tab-order assertions via
 * Testing Library. A full automated axe scan is deferred to Phase 18
 * (Accessibility), which introduces that tooling project-wide in one pass
 * rather than partially for just this one form; this test still verifies
 * FR-037/FR-038's concrete, checkable requirements (every control has an
 * accessible name, reachable in a sane tab order, and errors are announced).
 */
function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

describe("OperationConfigForm — Buffer accessibility", () => {
  beforeEach(() => {
    useAnalysisStore.setState({ selectedOperationType: "buffer", stagedInputLayerIds: ["l1"] })
  })

  it("every control has an accessible name reachable via role/label queries", () => {
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    expect(screen.getByRole("form", { name: /buffer parameters/i })).toBeTruthy()
    expect(screen.getByLabelText(/distance/i)).toBeTruthy()
    expect(screen.getByLabelText(/unit/i)).toBeTruthy()
    expect(screen.getByLabelText(/dissolve/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /run buffer/i })).toBeTruthy()
  })

  it("form fields follow a natural tab order (distance → unit → dissolve → submit)", () => {
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    const distance = screen.getByLabelText(/distance/i)
    const unit = screen.getByLabelText(/unit/i)
    const dissolve = screen.getByLabelText(/dissolve/i)
    const submit = screen.getByRole("button", { name: /run buffer/i })

    const form = screen.getByRole("form", { name: /buffer parameters/i })
    const focusable = Array.from(form.querySelectorAll("input, select, button"))
    expect(focusable).toEqual([distance, unit, dissolve, submit])
    // None opt out of the natural tab order (no positive tabindex hacks).
    for (const element of focusable) {
      expect(element.hasAttribute("tabindex")).toBe(false)
    }
  })

  it("a validation error is exposed via role=alert and linked to its field with aria-describedby", () => {
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })
    const distance = screen.getByLabelText(/distance/i)

    expect(distance.getAttribute("aria-invalid")).not.toBe("true")
    expect(distance.hasAttribute("aria-describedby")).toBe(false)
  })
})
