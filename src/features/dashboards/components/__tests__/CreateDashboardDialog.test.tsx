import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiRequestError } from "@/shared/errors/apiRequestError"
import { dashboardService } from "../../services/dashboardService"
import { CreateDashboardDialog } from "../CreateDashboardDialog"

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  vi.spyOn(dashboardService, "createDashboard").mockResolvedValue({
    dashboard: {
      id: "d1",
      projectId: "p1",
      ownerId: "u1",
      name: "Ops",
      templateId: null,
      visibility: "private",
      effectivePermission: "owner",
      isFavorite: false,
      sharedWithMe: false,
      createdAt: "t",
      updatedAt: "t",
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("CreateDashboardDialog", () => {
  it("rejects an empty name without calling the service (FR-001)", async () => {
    render(<CreateDashboardDialog projectId="p1" onCreated={vi.fn()} />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "New dashboard" }))
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Enter a name for the dashboard.")
    expect(dashboardService.createDashboard).not.toHaveBeenCalled()
  })

  it("creates a dashboard with a valid name and calls onCreated", async () => {
    const onCreated = vi.fn()
    render(<CreateDashboardDialog projectId="p1" onCreated={onCreated} />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "New dashboard" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ops" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("d1"))
    expect(dashboardService.createDashboard).toHaveBeenCalledWith("p1", { name: "Ops", templateId: undefined })
  })

  it("shows a specific message for a 409 DUPLICATE_NAME collision (matches api-contracts.md)", async () => {
    vi.spyOn(dashboardService, "createDashboard").mockRejectedValue(
      new ApiRequestError("A dashboard with this name already exists.", 409, "DUPLICATE_NAME"),
    )
    render(<CreateDashboardDialog projectId="p1" onCreated={vi.fn()} />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "New dashboard" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dup" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      'A dashboard named "Dup" already exists in this project.',
    )
  })
})
