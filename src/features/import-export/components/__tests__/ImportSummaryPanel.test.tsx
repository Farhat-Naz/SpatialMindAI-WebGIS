import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ImportSummary } from "../../types/importExport.types"
import { ImportSummaryPanel } from "../ImportSummaryPanel"

/**
 * `ImportSummaryPanel` tests (specs/005-import-export, T126; FR-010, FR-072,
 * SC-006).
 */

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    totalRead: 25,
    imported: 22,
    rejected: 2,
    duplicate: 1,
    repaired: 1,
    elapsedMs: 3400,
    jobId: "job-1",
    ...overrides,
  }
}

describe("ImportSummaryPanel", () => {
  it("shows every outcome count (FR-010)", () => {
    render(<ImportSummaryPanel summary={summary()} />)

    expect(screen.getByText("Features read")).toBeTruthy()
    expect(screen.getByText("Imported")).toBeTruthy()
    expect(screen.getByText("Rejected")).toBeTruthy()
    expect(screen.getByText("Skipped as duplicate")).toBeTruthy()
    expect(screen.getByText("Geometry repaired")).toBeTruthy()
  })

  it("shows counts that balance against the total read (SC-006)", () => {
    // 22 + 2 + 1 = 25, so nothing is silently unaccounted for.
    render(<ImportSummaryPanel summary={summary()} />)

    expect(screen.getByText("25")).toBeTruthy()
    expect(screen.getByText("22")).toBeTruthy()
    // No balance warning when the arithmetic holds.
    expect(screen.queryByText(/do not add up/i)).toBeNull()
  })

  it("flags counts that do not add up rather than showing them silently", () => {
    // A mismatch means the counts do not describe the file; hiding it would
    // misrepresent what happened.
    render(<ImportSummaryPanel summary={summary({ imported: 10 })} />)
    expect(screen.getByText(/do not add up/i)).toBeTruthy()
  })

  it("reports elapsed time", () => {
    render(<ImportSummaryPanel summary={summary({ elapsedMs: 3400 })} />)
    expect(screen.getByText("3.4 s")).toBeTruthy()
  })

  it.each([
    [450, "450 ms"],
    [3400, "3.4 s"],
    [125_000, "2 m 5 s"],
    [0, "—"],
  ])("formats %i ms as %s", (ms, expected) => {
    render(<ImportSummaryPanel summary={summary({ elapsedMs: ms })} />)
    expect(screen.getByText(expected)).toBeTruthy()
  })

  it("announces completion politely", () => {
    render(<ImportSummaryPanel summary={summary()} />)

    const status = screen.getByRole("status")
    expect(status.getAttribute("aria-live")).toBe("polite")
    expect(status.textContent).toMatch(/Import complete/)
  })

  it("offers no undo when rollback is unavailable", () => {
    render(<ImportSummaryPanel summary={summary()} />)
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull()
  })

  it("confirms before undoing, and explains what is and is not removed (FR-072)", async () => {
    const onUndo = vi.fn().mockResolvedValue(22)
    render(<ImportSummaryPanel summary={summary()} onUndo={onUndo} />)

    fireEvent.click(screen.getByRole("button", { name: "Undo this import" }))

    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy())
    // The scoping promise is the important part: concurrent users' features
    // survive (SC-011).
    expect(screen.getByText(/features other people added while it was running/i)).toBeTruthy()
    expect(onUndo).not.toHaveBeenCalled()
  })

  it("undoes with the job id when confirmed", async () => {
    const onUndo = vi.fn().mockResolvedValue(22)
    render(<ImportSummaryPanel summary={summary()} onUndo={onUndo} />)

    fireEvent.click(screen.getByRole("button", { name: "Undo this import" }))
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Undo import" }))

    await waitFor(() => expect(onUndo).toHaveBeenCalledWith("job-1"))
  })

  it("does not undo when the confirmation is declined", async () => {
    const onUndo = vi.fn()
    render(<ImportSummaryPanel summary={summary()} onUndo={onUndo} />)

    fireEvent.click(screen.getByRole("button", { name: "Undo this import" }))
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Keep them" }))

    expect(onUndo).not.toHaveBeenCalled()
  })

  it("reports the removal and withdraws the undo affordance afterwards", async () => {
    const onUndo = vi.fn().mockResolvedValue(22)
    render(<ImportSummaryPanel summary={summary()} onUndo={onUndo} />)

    fireEvent.click(screen.getByRole("button", { name: "Undo this import" }))
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Undo import" }))

    await waitFor(() => expect(screen.getByText(/Import undone/)).toBeTruthy())
    expect(screen.getByText(/22 features removed/)).toBeTruthy()
    // Rolling back twice is a conflict server-side, so the affordance goes away.
    expect(screen.queryByRole("button", { name: "Undo this import" })).toBeNull()
  })

  it("shows a Strict-mode notice as an alert", () => {
    // `totalRead` matches the outcome counts so the balance warning — itself an
    // alert — does not fire and make the query ambiguous.
    render(
      <ImportSummaryPanel
        summary={summary({ totalRead: 3, imported: 0, rejected: 2, duplicate: 1 })}
        notice="Strict mode: 2 feature(s) could not be imported, so all 22 already-imported feature(s) were removed."
      />,
    )

    expect(screen.getByRole("alert").textContent).toMatch(/Strict mode/)
  })

  it("offers a Done action when the caller supplies one", () => {
    const onDone = vi.fn()
    render(<ImportSummaryPanel summary={summary()} onDone={onDone} />)

    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("pluralizes a single-feature removal correctly", async () => {
    const onUndo = vi.fn().mockResolvedValue(1)
    render(<ImportSummaryPanel summary={summary({ imported: 1, rejected: 0, duplicate: 0, totalRead: 1 })} onUndo={onUndo} />)

    fireEvent.click(screen.getByRole("button", { name: "Undo this import" }))
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy())
    expect(screen.getByText(/Remove 1 imported feature\?/)).toBeTruthy()
  })
})
