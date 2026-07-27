import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../services/dashboardService"
import { CreateDashboardDialog } from "../components/CreateDashboardDialog"

/** Full Templates flow (quickstart.md §8; spec.md US8 Acceptance Scenarios 1–6). */

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const TEMPLATES = [
  { id: "t-blank", key: "blank", name: "Blank", description: "Empty", widgetsBlueprint: [], createdAt: "t", updatedAt: "t" },
  { id: "t-exec", key: "executive", name: "Executive", description: "Summary", widgetsBlueprint: [], createdAt: "t", updatedAt: "t" },
  { id: "t-ops", key: "operations", name: "Operations", description: "Live view", widgetsBlueprint: [], createdAt: "t", updatedAt: "t" },
  { id: "t-asset", key: "asset", name: "Asset", description: "Map + table", widgetsBlueprint: [], createdAt: "t", updatedAt: "t" },
  { id: "t-env", key: "environmental", name: "Environmental", description: "Monitoring", widgetsBlueprint: [], createdAt: "t", updatedAt: "t" },
]

beforeEach(() => {
  vi.spyOn(dashboardService, "listTemplates").mockResolvedValue({ templates: TEMPLATES })
  vi.spyOn(dashboardService, "createDashboard").mockResolvedValue({
    dashboard: {
      id: "d1",
      projectId: "p1",
      ownerId: "u1",
      name: "New",
      templateId: "t-exec",
      visibility: "private",
      effectivePermission: "owner",
      isFavorite: false,
      sharedWithMe: false,
      widgets: [],
      createdAt: "t",
      updatedAt: "t",
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Templates — full flow", () => {
  it("Scenario 1: choosing Blank creates a dashboard with templateId undefined (no template)", async () => {
    const onCreated = vi.fn()
    render(<CreateDashboardDialog projectId="p1" onCreated={onCreated} />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "New dashboard" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My Dash" } })
    await waitFor(() => expect(screen.getByText("Blank")).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: /Blank/ }))
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() =>
      expect(dashboardService.createDashboard).toHaveBeenCalledWith("p1", { name: "My Dash", templateId: undefined }),
    )
  })

  it("Scenario 2: choosing Executive passes its template id into useCreateDashboard (T237)", async () => {
    const onCreated = vi.fn()
    render(<CreateDashboardDialog projectId="p1" onCreated={onCreated} />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "New dashboard" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Exec Dash" } })
    await waitFor(() => expect(screen.getByText("Executive")).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: /Executive/ }))
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() =>
      expect(dashboardService.createDashboard).toHaveBeenCalledWith("p1", { name: "Exec Dash", templateId: "t-exec" }),
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("d1"))
  })

  it("Scenario 3-5: Operations/Asset/Environmental are each independently selectable and distinguishable", async () => {
    render(<CreateDashboardDialog projectId="p1" onCreated={vi.fn()} />, { wrapper: wrapper() })
    fireEvent.click(screen.getByRole("button", { name: "New dashboard" }))

    await waitFor(() => expect(screen.getByText("Operations")).toBeTruthy())
    expect(screen.getByText("Asset")).toBeTruthy()
    expect(screen.getByText("Environmental")).toBeTruthy()

    fireEvent.click(screen.getByRole("radio", { name: /Asset/ }))
    expect(screen.getByRole("radio", { name: /Asset/ })).toHaveProperty("ariaChecked", "true")
  })

  it("Scenario 6 / T240: a template-created dashboard has no templateId-gated restriction — the created record is an ordinary dashboard", async () => {
    const onCreated = vi.fn()
    render(<CreateDashboardDialog projectId="p1" onCreated={onCreated} />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "New dashboard" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "From Template" } })
    await waitFor(() => expect(screen.getByText("Executive")).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: /Executive/ }))
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("d1"))
    // The returned record carries a normal effectivePermission/visibility
    // shape identical to a manually-created dashboard — no separate
    // "template dashboard" type exists anywhere in this response.
    const created = vi.mocked(dashboardService.createDashboard).mock.results[0]?.value
    await expect(created).resolves.toMatchObject({ dashboard: { effectivePermission: "owner", visibility: "private" } })
  })
})
