import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ImportJobRecordDto, ImportStatus } from "@/shared/contracts/importJob.schema"
import { importService } from "../../services/importService"
import { ImportHistoryPanel } from "../ImportHistoryPanel"

/**
 * `ImportHistoryPanel` behavior tests (specs/005-import-export, Phase 15/16;
 * FR-075, FR-077–FR-080).
 */

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function job(overrides: Partial<ImportJobRecordDto> = {}): ImportJobRecordDto {
  return {
    id: "job-1",
    projectId: "proj-1",
    userId: "dev-user-1",
    targetLayerId: "layer-1",
    targetLayerName: "Parcels",
    sourceFormat: "geojson",
    fileName: "parcels.geojson",
    fileSizeBytes: 2048,
    mimeType: "application/geo+json",
    fileHash: null,
    sourceCrs: "EPSG:27700",
    customCrsDefinition: null,
    mode: "lenient",
    columnMapping: null,
    status: "succeeded",
    totalFeatures: 25,
    importedCount: 22,
    rejectedCount: 2,
    duplicateCount: 1,
    repairedCount: 1,
    chunksCommitted: 1,
    errorMessage: null,
    cancelRequestedAt: null,
    heartbeatAt: null,
    startedAt: "2026-07-27T10:00:00.000Z",
    completedAt: "2026-07-27T10:00:05.000Z",
    createdAt: "2026-07-27T10:00:00.000Z",
    ...overrides,
  }
}

let listForProject: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  listForProject = vi
    .spyOn(importService, "listForProject")
    .mockResolvedValue({ imports: [job()], nextCursor: null } as never)
  vi.spyOn(importService, "listIssues").mockResolvedValue({
    issues: [{ id: "i1", sourcePosition: 3, category: "duplicate_in_file", message: "dup" }],
    nextCursor: null,
    totalPersisted: 1,
    truncated: false,
  } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ImportHistoryPanel", () => {
  it("shows the entry's provenance: file, layer, format, size, CRS (FR-075)", async () => {
    render(<ImportHistoryPanel projectId="proj-1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("parcels.geojson")).toBeTruthy())
    const meta = screen.getByText(/into Parcels/).textContent!
    expect(meta).toMatch(/GEOJSON/)
    expect(meta).toMatch(/2\.0 KB/)
    expect(meta).toMatch(/EPSG:27700/)
  })

  it("keeps the layer name readable after the layer was deleted (FR-079)", async () => {
    listForProject.mockResolvedValue({
      imports: [job({ targetLayerId: null })],
      nextCursor: null,
    } as never)

    render(<ImportHistoryPanel projectId="proj-1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText(/into Parcels/)).toBeTruthy())
    // The snapshot survives; the deletion is stated rather than hidden.
    expect(screen.getByText(/layer since deleted/)).toBeTruthy()
  })

  it("re-queries with the chosen status filter, resetting the cursor (FR-077)", async () => {
    render(<ImportHistoryPanel projectId="proj-1" />, { wrapper: wrapper() })
    await waitFor(() => expect(listForProject).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText("Filter import history by status"), {
      target: { value: "failed" satisfies ImportStatus },
    })

    await waitFor(() =>
      expect(listForProject).toHaveBeenLastCalledWith("proj-1", { status: "failed" }),
    )
  })

  it("pages older imports via the cursor", async () => {
    listForProject.mockResolvedValue({ imports: [job()], nextCursor: "cursor-2" } as never)
    render(<ImportHistoryPanel projectId="proj-1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByRole("button", { name: "Load older imports" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Load older imports" }))

    await waitFor(() =>
      expect(listForProject).toHaveBeenLastCalledWith("proj-1", { cursor: "cursor-2" }),
    )
  })

  it("loads a job's issues only when the entry is expanded", async () => {
    render(<ImportHistoryPanel projectId="proj-1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("parcels.geojson")).toBeTruthy())

    // Not fetched eagerly with the list.
    expect(importService.listIssues).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "View issues" }))
    await waitFor(() => expect(importService.listIssues).toHaveBeenCalledWith("job-1", expect.anything()))
    // The report renders on the query's next tick, after the fetch resolves.
    await waitFor(() => expect(screen.getByText("dup")).toBeTruthy())
  })

  it("hides rollback from a view-only member (FR-080)", async () => {
    render(<ImportHistoryPanel projectId="proj-1" canModify={false} onRollback={vi.fn()} />, {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(screen.getByText("parcels.geojson")).toBeTruthy())
    // The API enforces the gate regardless; the UI simply doesn't offer it.
    expect(screen.queryByRole("button", { name: "Undo this import" })).toBeNull()
  })

  it("offers rollback to an editor, from succeeded, behind a confirmation (FR-072)", async () => {
    const onRollback = vi.fn().mockResolvedValue(22)
    render(<ImportHistoryPanel projectId="proj-1" canModify onRollback={onRollback} />, {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(screen.getByRole("button", { name: "Undo this import" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Undo this import" }))

    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy())
    expect(screen.getByText(/including features other people added since/i)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Undo import" }))
    await waitFor(() => expect(onRollback).toHaveBeenCalledWith("job-1"))
  })

  it("does not offer rollback on an already-undone import", async () => {
    listForProject.mockResolvedValue({
      imports: [job({ status: "rolled_back" })],
      nextCursor: null,
    } as never)

    render(<ImportHistoryPanel projectId="proj-1" canModify onRollback={vi.fn()} />, {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(screen.getByText("Undone")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Undo this import" })).toBeNull()
  })

  it("says plainly when nothing has been imported yet", async () => {
    listForProject.mockResolvedValue({ imports: [], nextCursor: null } as never)
    render(<ImportHistoryPanel projectId="proj-1" />, { wrapper: wrapper() })

    await waitFor(() =>
      expect(screen.getByText(/Nothing has been imported into this project yet/)).toBeTruthy(),
    )
  })
})
