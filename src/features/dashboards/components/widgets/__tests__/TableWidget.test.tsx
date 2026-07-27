import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { featureService } from "@/features/database/services/featureService"
import { TableWidget } from "../TableWidget"
import type { DashboardWidgetRecord } from "../../../types/dashboard.types"

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function widget(): DashboardWidgetRecord {
  return {
    id: "w1",
    dashboardId: "d1",
    type: "table",
    title: null,
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
  vi.spyOn(featureService, "list").mockResolvedValue({
    features: [
      { id: "f1", layerId: "layer-1", geometry: { type: "Point", coordinates: [1, 1] }, attributes: [{ key: "name", value: "B" }], createdAt: "t", updatedAt: "t" },
      { id: "f2", layerId: "layer-1", geometry: { type: "Point", coordinates: [2, 2] }, attributes: [{ key: "name", value: "A" }], createdAt: "t", updatedAt: "t" },
    ],
    nextCursor: "next-1",
  } as never)
})

describe("TableWidget", () => {
  it("reuses the cursor-paginated Features API — never a full-layer client-side load", async () => {
    render(<TableWidget widget={widget()} data={undefined} isLoading={false} isEditMode={false} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("B")).toBeTruthy())
    expect(featureService.list).toHaveBeenCalledWith("layer-1", { cursor: undefined, limit: 10 })
  })

  it("sorting is client-side over the current page only", async () => {
    render(<TableWidget widget={widget()} data={undefined} isLoading={false} isEditMode={false} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("B")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /^name/ }))

    // Columns are [id, name]; after ascending sort by name, row 0 is "A" (f2).
    const cells = screen.getAllByRole("cell")
    expect(cells[1].textContent).toBe("A")
  })

  it("Next fetches the following cursor page", async () => {
    render(<TableWidget widget={widget()} data={undefined} isLoading={false} isEditMode={false} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("B")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    await waitFor(() => expect(featureService.list).toHaveBeenLastCalledWith("layer-1", { cursor: "next-1", limit: 10 }))
  })

  it("shows a message when no layer is bound", () => {
    render(
      <TableWidget widget={{ ...widget(), dataSourceId: null }} data={undefined} isLoading={false} isEditMode={false} />,
      { wrapper: wrapper() },
    )
    expect(screen.getByText("No layer selected for this table.")).toBeTruthy()
  })
})
