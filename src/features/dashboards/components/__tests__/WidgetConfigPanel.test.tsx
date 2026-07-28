import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { widgetService } from "../../services/widgetService"
import { useLayers } from "@/features/database/hooks/useLayers"
import { useAnalysisRuns } from "@/features/analysis/hooks/useAnalysis"
import { useDashboardBuilderStore } from "../../store/dashboardBuilderStore"
import { WidgetConfigPanel } from "../WidgetConfigPanel"

vi.mock("@/features/database/hooks/useLayers", () => ({ useLayers: vi.fn() }))
vi.mock("@/features/analysis/hooks/useAnalysis", () => ({ useAnalysisRuns: vi.fn() }))

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const INITIAL_STORE_STATE = useDashboardBuilderStore.getState()

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_STORE_STATE, true)
  vi.mocked(useLayers).mockReturnValue({ data: [{ id: "layer-1", name: "Parcels" }] } as never)
  vi.mocked(useAnalysisRuns).mockReturnValue({ data: { runs: [] } } as never)
  vi.spyOn(widgetService, "addWidget").mockResolvedValue({ widget: {} as never, layout: [] })
  vi.spyOn(widgetService, "updateWidget").mockResolvedValue({ widget: {} as never })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("WidgetConfigPanel", () => {
  it("changing the type picker swaps which data-source options are relevant (data-driven vs not)", () => {
    render(<WidgetConfigPanel projectId="p1" dashboardId="d1" open={true} onOpenChange={vi.fn()} />, {
      wrapper: wrapper(),
    })

    expect(screen.queryByLabelText("Data source")).toBeNull()

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "statistics" } })
    expect(screen.getByLabelText("Data source")).toBeTruthy()
  })

  it("add-widget flow: submits to useAddWidget (FR-005)", async () => {
    render(<WidgetConfigPanel projectId="p1" dashboardId="d1" open={true} onOpenChange={vi.fn()} />, {
      wrapper: wrapper(),
    })

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My Widget" } })
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "Hello" } })
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))

    await waitFor(() =>
      expect(widgetService.addWidget).toHaveBeenCalledWith(
        "d1",
        expect.objectContaining({ type: "text", title: "My Widget", config: { content: "Hello" } }),
      ),
    )
  })

  it("edit-widget flow: submits to useUpdateWidget, not a second add (no duplicate widget)", async () => {
    useDashboardBuilderStore.getState().selectWidget("w1", { content: "existing" })
    render(<WidgetConfigPanel projectId="p1" dashboardId="d1" open={true} onOpenChange={vi.fn()} />, {
      wrapper: wrapper(),
    })

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(widgetService.updateWidget).toHaveBeenCalledWith("w1", expect.any(Object)))
    expect(widgetService.addWidget).not.toHaveBeenCalled()
  })

  it("data source picker: selecting 'layer' narrows the second picker to layers only", async () => {
    render(<WidgetConfigPanel projectId="p1" dashboardId="d1" open={true} onOpenChange={vi.fn()} />, {
      wrapper: wrapper(),
    })

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "table" } })
    fireEvent.change(screen.getByLabelText("Data source"), { target: { value: "layer" } })

    expect(screen.getByLabelText("Layer")).toBeTruthy()
    expect(screen.getByText("Parcels")).toBeTruthy()
    expect(screen.queryByLabelText("Analysis run")).toBeNull()
  })

  it("data source picker: selecting 'analysisRun' narrows to the run history list", async () => {
    vi.mocked(useAnalysisRuns).mockReturnValue({
      data: { runs: [{ id: "run-1", operationType: "buffer", createdAt: "2026-01-01T00:00:00.000Z" }] },
    } as never)
    render(<WidgetConfigPanel projectId="p1" dashboardId="d1" open={true} onOpenChange={vi.fn()} />, {
      wrapper: wrapper(),
    })

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "statistics" } })
    fireEvent.change(screen.getByLabelText("Data source"), { target: { value: "analysisRun" } })

    expect(screen.getByLabelText("Analysis run")).toBeTruthy()
    expect(screen.queryByLabelText("Layer")).toBeNull()
  })
})
