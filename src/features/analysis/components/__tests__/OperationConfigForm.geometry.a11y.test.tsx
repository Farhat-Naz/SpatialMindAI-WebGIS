import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OperationConfigForm } from "../OperationConfigForm"
import { useAnalysisStore } from "../../store/analysisStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: { runAnalysis: vi.fn() },
}))

const useFeaturesMock = vi.fn()

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
  featureService: { list: vi.fn().mockResolvedValue({ features: [], nextCursor: null }) },
  useFeatures: (layerId: string) => useFeaturesMock(layerId),
  useDatabaseStore: (selector: (state: unknown) => unknown) =>
    selector({ selectLayer: vi.fn(), selectFeatureRange: vi.fn() }),
}))

vi.mock("@/features/database/store/editingStore", () => ({
  useEditingStore: (selector: (state: unknown) => unknown) => selector({ setTool: vi.fn() }),
}))

/**
 * T199 (US5 accessibility check) — keyboard traversal and accessible-name
 * assertions for the Geometry Processing forms, including the `Slider`
 * primitive. Follows T135/T181's convention: a full automated axe scan is
 * deferred to Phase 18, which introduces that tooling project-wide in one
 * pass. Covers FR-037/FR-038's concrete, checkable parts.
 */
function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

const GEOMETRY_FORMS = [
  ["simplify", "Simplify"],
  ["smoothGeometry", "Smooth"],
  ["repairGeometry", "Repair Geometry"],
  ["multipartToSinglepart", "Multipart to Singlepart"],
  ["singlepartToMultipart", "Singlepart to Multipart"],
  ["dissolve", "Dissolve"],
  ["merge", "Merge"],
  ["split", "Split"],
] as const

describe("OperationConfigForm — Geometry Processing accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFeaturesMock.mockReturnValue({ data: undefined })
  })

  it.each(GEOMETRY_FORMS)("%s exposes its form and submit control by accessible name", (operationType, title) => {
    useAnalysisStore.setState({ selectedOperationType: operationType, stagedInputLayerIds: ["a", "b"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    expect(screen.getByRole("form", { name: new RegExp(`${title} parameters`, "i") })).toBeTruthy()
    expect(screen.getByRole("button", { name: new RegExp(`^run ${title}$`, "i") })).toBeTruthy()
  })

  it("the Simplify slider has an accessible name and is keyboard-operable", () => {
    useAnalysisStore.setState({ selectedOperationType: "simplify", stagedInputLayerIds: ["l1"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    // Radix puts role="slider" on the thumb, so the name must come from the
    // thumb's own aria-label - a <label htmlFor> can only reach the root.
    const slider = screen.getByRole("slider", { name: /simplify tolerance/i })
    expect(slider.getAttribute("tabindex")).toBe("0")

    slider.focus()
    expect(document.activeElement).toBe(slider)
    expect(slider.getAttribute("aria-valuemin")).toBeTruthy()
    expect(slider.getAttribute("aria-valuemax")).toBeTruthy()
    expect(slider.getAttribute("aria-valuenow")).toBeTruthy()
  })

  it("Simplify's tolerance is reachable by a labelled text control as well as the slider", () => {
    useAnalysisStore.setState({ selectedOperationType: "simplify", stagedInputLayerIds: ["l1"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    // A slider alone cannot express an arbitrary precise tolerance, so the
    // number input is the accessible path to an exact value.
    const input = screen.getByLabelText(/^tolerance/i) as HTMLInputElement
    expect(input.type).toBe("number")
    input.focus()
    expect(document.activeElement).toBe(input)
  })

  it("Dissolve's attribute picker is labelled in both its picker and fallback forms", () => {
    useFeaturesMock.mockReturnValue({
      data: { features: [{ id: "f1", attributes: [{ key: "zone", value: "R1" }] }] },
    })
    useAnalysisStore.setState({ selectedOperationType: "dissolve", stagedInputLayerIds: ["l1"] })
    const { unmount } = render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })
    expect((screen.getByLabelText(/dissolve by attribute/i) as HTMLElement).tagName).toBe("SELECT")
    unmount()

    useFeaturesMock.mockReturnValue({ data: undefined })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })
    expect((screen.getByLabelText(/dissolve by attribute/i) as HTMLElement).tagName).toBe("INPUT")
  })

  it("Split's draw trigger is a non-submitting button, so keyboard activation cannot fire the run", () => {
    useAnalysisStore.setState({ selectedOperationType: "split", stagedInputLayerIds: ["a", "b"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    const draw = screen.getByRole("button", { name: /draw a split line/i })
    expect(draw.getAttribute("type")).toBe("button")
  })

  it.each(GEOMETRY_FORMS)("%s announces its validation error via role=alert", (operationType, title) => {
    // Nothing staged, so every form rejects on submit.
    useAnalysisStore.setState({ selectedOperationType: operationType, stagedInputLayerIds: [] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^run ${title}$`, "i") }))
    expect(screen.getByRole("alert").textContent).toBeTruthy()
  })

  it("no form uses a positive tabindex to override natural order", () => {
    for (const [operationType] of GEOMETRY_FORMS) {
      useAnalysisStore.setState({ selectedOperationType: operationType, stagedInputLayerIds: ["a", "b"] })
      const { container, unmount } = render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      for (const element of container.querySelectorAll("[tabindex]")) {
        expect(Number(element.getAttribute("tabindex"))).toBeLessThanOrEqual(0)
      }
      unmount()
    }
  })
})
