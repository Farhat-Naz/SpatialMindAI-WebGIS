import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as pipeline from "../../services/importPipeline"
import { importService } from "../../services/importService"
import type { PreflightResult } from "../../types/importExport.types"
import { useImportStore } from "../../store/importStore"
import { ImportDialog } from "../ImportDialog"

/**
 * `ImportDialog` tests (specs/005-import-export, T126; FR-005, FR-011, SC-010).
 *
 * The gate tests are the ones that matter most: FR-011's guarantee is that
 * abandoning at the confirmation step writes nothing, and the strongest possible
 * assertion of that is **that no request was issued at all**.
 */

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <ImportDialog
      open
      onOpenChange={onOpenChange}
      layerId="layer-1"
      layerName="Parcels"
      projectId="proj-1"
    />,
    { wrapper: wrapper() },
  )
  return { onOpenChange }
}

function preflightResult(overrides: Partial<PreflightResult> = {}): PreflightResult {
  return {
    features: [
      { sourcePosition: 0, geometry: { type: "Point", coordinates: [1, 1] }, properties: {} },
      { sourcePosition: 1, geometry: { type: "Point", coordinates: [2, 2] }, properties: {} },
    ],
    totalFeatures: 25,
    issues: [],
    counts: { rejected: 2, duplicate: 1, repaired: 1 },
    duplicatePositions: [],
    detectedCrs: "EPSG:4326",
    previewBbox: [0, 0, 5, 5],
    ...overrides,
  }
}

/**
 * Puts the store at the confirmation gate, as a completed preflight would.
 *
 * Always called **before** `renderDialog`: a Zustand update outside React's
 * `act()` does not flush into an already-mounted tree, so staging first is both
 * simpler and closer to how the dialog is actually reached (the store is
 * populated by `useImport.preflight`, then the step advances and the tree
 * re-renders inside React's own batching).
 */
function stageGate(overrides: Partial<PreflightResult> = {}, bboxPlausible = true): void {
  const store = useImportStore.getState()
  store.setFile(new File(["{}"], "parcels.geojson"), "geojson")
  store.setPreflight(preflightResult(overrides))
  store.setCrs({ code: overrides.detectedCrs ?? "EPSG:4326", bboxPlausible })
  store.setStep("parsing")
  useImportStore.getState().setStep("confirming")
}

let create: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  useImportStore.getState().reset()
  create = vi.spyOn(importService, "create").mockResolvedValue({ importJob: { id: "job-1" } } as never)
  vi.spyOn(importService, "commitChunk").mockResolvedValue({
    chunkIndex: 0,
    committed: 2,
    rejected: [],
    job: { importedCount: 2, rejectedCount: 0, duplicateCount: 0, status: "running" },
  } as never)
  vi.spyOn(importService, "complete").mockResolvedValue({ importJob: {} } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ImportDialog — shell", () => {
  it("names the target layer and states the append-only guarantee (FR-003)", () => {
    renderDialog()

    expect(screen.getByText(/Import into/)).toBeTruthy()
    expect(screen.getByText(/Parcels/)).toBeTruthy()
    expect(screen.getByText(/Nothing already in it is changed or removed/i)).toBeTruthy()
  })

  it("starts at file selection", () => {
    renderDialog()
    expect(screen.getByRole("button", { name: "Choose file" })).toBeTruthy()
    // No gate, no progress yet.
    expect(screen.queryByRole("button", { name: "Import features" })).toBeNull()
  })

  it("shows progress while parsing", () => {
    useImportStore.getState().setStep("parsing")
    useImportStore.getState().setProgress({ processed: 400, total: 0 })
    renderDialog()

    expect(screen.getByRole("progressbar")).toBeTruthy()
  })

  it("uses the shared shadcn Dialog rather than a hand-rolled modal", () => {
    renderDialog()
    // Radix marks its content with role="dialog" and manages focus and Escape.
    expect(screen.getByRole("dialog")).toBeTruthy()
  })
})

describe("ImportDialog — the confirmation gate (FR-005, FR-011)", () => {
  it("shows the preflight's exact counts before anything is written", () => {
    stageGate()
    renderDialog()

    expect(screen.getByText("Features read")).toBeTruthy()
    expect(screen.getByText("25")).toBeTruthy()
    expect(screen.getByText("Will be imported")).toBeTruthy()
    // 25 read − 2 rejected − 1 duplicate = 22.
    expect(screen.getByText("22")).toBeTruthy()
  })

  it("shows the coordinate system the import will use", () => {
    stageGate({ detectedCrs: "EPSG:27700" })
    renderDialog()
    expect(screen.getByText("EPSG:27700")).toBeTruthy()
  })

  it("issues no network request while the gate is open", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    stageGate()
    renderDialog()

    // FR-011's guarantee is not "cleaned up afterwards" — it is that nothing has
    // been requested yet at all.
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("writes nothing when abandoned at the gate (FR-011)", async () => {
    stageGate()
    const { onOpenChange } = renderDialog()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(create).not.toHaveBeenCalled()
    // The store is cleared, releasing the file and the issue list.
    expect(useImportStore.getState().step).toBe("idle")
    expect(useImportStore.getState().file).toBeNull()
  })

  it("defaults to lenient mode (FR-006)", () => {
    stageGate()
    renderDialog()

    const lenient = screen.getByRole("radio", { name: /Import what is valid/ }) as HTMLInputElement
    expect(lenient.checked).toBe(true)
  })

  it("lets the user choose strict mode", () => {
    stageGate()
    renderDialog()

    fireEvent.click(screen.getByRole("radio", { name: /Import nothing unless everything is valid/ }))
    expect(useImportStore.getState().mode).toBe("strict")
  })

  it("starts the import on confirm", async () => {
    stageGate()
    renderDialog()

    fireEvent.click(screen.getByRole("button", { name: "Import features" }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  })
})

describe("ImportDialog — wrong-CRS guard (FR-065, SC-010)", () => {
  it("blocks confirmation until an implausible extent is acknowledged", () => {
    stageGate({ detectedCrs: "EPSG:4326" }, false)
    renderDialog()

    expect(screen.getByRole("alert").textContent).toMatch(/do not look like they are in/i)
    // The classic wrong-CRS disaster is prevented by refusing to proceed, not by
    // a warning the user can scroll past.
    const confirm = screen.getByRole("button", { name: "Import features" }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
  })

  it("allows confirmation once acknowledged", async () => {
    stageGate({ detectedCrs: "EPSG:4326" }, false)
    renderDialog()

    fireEvent.click(screen.getByRole("checkbox", { name: /checked the coordinate system/i }))

    const confirm = screen.getByRole("button", { name: "Import features" }) as HTMLButtonElement
    expect(confirm.disabled).toBe(false)

    fireEvent.click(confirm)
    await waitFor(() => expect(create).toHaveBeenCalled())
  })

  it("does not demand acknowledgement for a plausible extent", () => {
    stageGate({ counts: { rejected: 2, duplicate: 0, repaired: 1 } }, true)
    renderDialog()

    expect(screen.queryByRole("checkbox")).toBeNull()
    expect((screen.getByRole("button", { name: "Import features" }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })
})

describe("ImportDialog — running and done", () => {
  it("offers cancellation while running", () => {
    stageGate()
    useImportStore.getState().setStep("running")
    useImportStore.getState().setProgress({ processed: 500, total: 1000 })
    renderDialog()

    expect(screen.getByRole("button", { name: "Cancel import" })).toBeTruthy()
    // The footer's Cancel/Confirm pair is gone — Cancel import is the only exit.
    expect(screen.queryByRole("button", { name: "Import features" })).toBeNull()
  })

  it("does not close on an outside click while running", () => {
    stageGate()
    useImportStore.getState().setStep("running")
    const { onOpenChange } = renderDialog()

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })

    // A running import must be stopped explicitly, because cancelling has to tell
    // the server too.
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("shows the summary when finished", () => {
    stageGate()
    useImportStore.getState().setStep("running")
    useImportStore.getState().setSummary({
      totalRead: 25,
      imported: 22,
      rejected: 2,
      duplicate: 1,
      repaired: 1,
      elapsedMs: 2100,
      jobId: "job-1",
    })
    useImportStore.getState().setStep("done")
    renderDialog()

    expect(screen.getByText(/Import complete/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Undo this import" })).toBeTruthy()
  })
})

describe("ImportDialog — errors", () => {
  it("reports a parse failure as an alert at the file step", async () => {
    vi.spyOn(pipeline, "runPreflight").mockRejectedValue(new Error("This file is not valid JSON."))
    renderDialog()

    const input = screen.getByLabelText("Choose a file to import") as HTMLInputElement
    Object.defineProperty(input, "files", {
      value: [new File(["{bad"], "bad.geojson", { type: "application/geo+json" })],
      configurable: true,
    })
    fireEvent.change(input)

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/not valid JSON/))
  })
})
