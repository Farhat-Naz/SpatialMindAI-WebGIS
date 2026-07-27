import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../../services/dashboardService"
import { TemplatePicker } from "../TemplatePicker"

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("TemplatePicker", () => {
  it("renders all five templates, each visually/semantically distinguishable", async () => {
    render(<TemplatePicker selectedTemplateId={undefined} onSelect={vi.fn()} />, { wrapper: wrapper() })

    for (const template of TEMPLATES) {
      await waitFor(() => expect(screen.getByText(template.name)).toBeTruthy())
      expect(screen.getByText(template.description)).toBeTruthy()
    }
  })

  it("selecting a non-blank template calls onSelect with its id", async () => {
    const onSelect = vi.fn()
    render(<TemplatePicker selectedTemplateId={undefined} onSelect={onSelect} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Executive")).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: /Executive/ }))

    expect(onSelect).toHaveBeenCalledWith("t-exec")
  })

  it("selecting Blank calls onSelect with undefined (matches the default no-template create flow)", async () => {
    const onSelect = vi.fn()
    render(<TemplatePicker selectedTemplateId={undefined} onSelect={onSelect} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Blank")).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: /Blank/ }))

    expect(onSelect).toHaveBeenCalledWith(undefined)
  })

  it("is keyboard-navigable: each card is a radio in a labeled radiogroup (T241)", async () => {
    render(<TemplatePicker selectedTemplateId="t-asset" onSelect={vi.fn()} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByRole("radiogroup", { name: "Dashboard template" })).toBeTruthy())
    expect(screen.getByRole("radio", { name: /Asset/ })).toHaveProperty("ariaChecked", "true")
  })
})
