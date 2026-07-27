import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ImportExportControls } from "../components/ImportExportControls"
import { useImportStore } from "@/features/import-export/store/importStore"
import { useExportStore } from "@/features/import-export/store/exportStore"

/**
 * `ImportExportControls` tests.
 *
 * **Rewritten by specs/005-import-export (T124)** alongside the component. The
 * previous suite asserted the inline GeoJSON and loose-file Shapefile handlers,
 * the >100-feature confirmation, and the inline result text — all of which the
 * spec sanctions replacing with the fuller interchange interface rather than
 * duplicating. Those behaviours are now covered where they live:
 *
 * - format detection and rejection → `FileDropZone.test.tsx`
 * - the confirmation gate and its counts → `ImportDialog.test.tsx`
 * - the result accounting and undo → `ImportSummaryPanel.test.tsx`
 *
 * What remains to test here is exactly what remains in the component: that it
 * launches the two dialogs, and that it holds no import/export logic of its own.
 */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

function renderControls() {
  return render(
    <ImportExportControls layerId="l1" layerName="Roads" projectId="p1" />,
    { wrapper: createWrapper() },
  )
}

describe("ImportExportControls", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useImportStore.getState().reset()
    useExportStore.getState().reset()
  })

  it("renders an Import and an Export button, both labelled", () => {
    renderControls()

    expect(screen.getByRole("button", { name: "Import features" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Export layer" })).toBeTruthy()
  })

  it("mounts neither dialog until one is opened", () => {
    renderControls()

    // Deferred mounting keeps the dialogs' dynamically imported dependencies out
    // of the request path until a user actually asks for them.
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens the import dialog, naming the target layer", async () => {
    renderControls()
    fireEvent.click(screen.getByRole("button", { name: "Import features" }))

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy())
    expect(screen.getByText(/Import into/)).toBeTruthy()
    expect(screen.getByText(/Roads/)).toBeTruthy()
  })

  it("states the append-only guarantee in the import dialog (FR-003)", async () => {
    renderControls()
    fireEvent.click(screen.getByRole("button", { name: "Import features" }))

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy())
    expect(screen.getByText(/Nothing already in it is changed or removed/i)).toBeTruthy()
  })

  it("opens the export dialog", async () => {
    renderControls()
    fireEvent.click(screen.getByRole("button", { name: "Export layer" }))

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy())
    expect(screen.getByRole("heading", { name: "Export" })).toBeTruthy()
  })

  it("offers all three export scopes (FR-035)", async () => {
    renderControls()
    fireEvent.click(screen.getByRole("button", { name: "Export layer" }))

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy())
    const scopeSelect = screen.getByLabelText("What to export")
    expect(scopeSelect).toBeTruthy()

    const options = Array.from((scopeSelect as HTMLSelectElement).options).map((o) => o.value)
    expect(options).toEqual(["layer", "selection", "project"])
  })

  it("makes clear the export happens in the browser with no upload", async () => {
    renderControls()
    fireEvent.click(screen.getByRole("button", { name: "Export layer" }))

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy())
    expect(screen.getByText(/nothing is uploaded/i)).toBeTruthy()
  })
})
