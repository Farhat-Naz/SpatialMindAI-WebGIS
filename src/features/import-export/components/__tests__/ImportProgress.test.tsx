import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ImportProgress } from "../ImportProgress"

/**
 * `ImportProgress` tests (specs/005-import-export, T126; FR-009, FR-088, FR-089).
 *
 * FR-089's requirement — that progress is never conveyed by width or colour
 * alone — is what most of these assert: the native `<progress>` semantics, the
 * visible percentage, and the "N of M" text are three independent channels
 * carrying the same fact.
 */

describe("ImportProgress", () => {
  it("renders a native progress element carrying value and max (FR-089)", () => {
    render(<ImportProgress progress={{ processed: 250, total: 1000 }} />)

    const bar = screen.getByRole("progressbar", { name: "Import progress" }) as HTMLProgressElement
    // Real element semantics, so a screen reader reads a percentage rather than
    // inferring one from a styled div.
    expect(bar.tagName).toBe("PROGRESS")
    expect(bar.value).toBe(250)
    expect(bar.max).toBe(1000)
  })

  it("shows the percentage as text as well as in the bar", () => {
    render(<ImportProgress progress={{ processed: 250, total: 1000 }} />)
    // Two occurrences by design: the visible label, and the <progress>
    // element's fallback text for a browser that cannot render it.
    expect(screen.getAllByText("25%").length).toBeGreaterThanOrEqual(1)
  })

  it("shows the features-processed-of-total readout (FR-009)", () => {
    render(<ImportProgress progress={{ processed: 2500, total: 10000 }} />)
    expect(screen.getByText(/2,500 of 10,000 features/)).toBeTruthy()
  })

  it("announces updates politely without moving focus (FR-088)", () => {
    render(<ImportProgress progress={{ processed: 500, total: 1000 }} />)

    const status = screen.getByRole("status")
    expect(status.getAttribute("aria-live")).toBe("polite")
    // Atomic, so the reader speaks the whole readout rather than only the digits
    // that changed.
    expect(status.getAttribute("aria-atomic")).toBe("true")
    // Focus stays where the user put it.
    expect(document.activeElement).toBe(document.body)
  })

  it("reports indeterminate progress while the denominator is unknown", () => {
    // A parse that has not yet counted the file omits `value` entirely, which is
    // how a native progress element expresses "working, total unknown" — better
    // than a fake 0%.
    render(<ImportProgress progress={{ processed: 400, total: 0 }} />)

    const bar = screen.getByRole("progressbar") as HTMLProgressElement
    expect(bar.getAttribute("value")).toBeNull()
    expect(screen.getAllByText(/Reading file/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Read 400 features so far/)).toBeTruthy()
  })

  it("clamps a percentage that would exceed 100", () => {
    render(<ImportProgress progress={{ processed: 1500, total: 1000 }} />)
    expect(screen.getAllByText("100%").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/1,000 of 1,000 features/)).toBeTruthy()
  })

  it("renders no cancel button when cancellation is not offered", () => {
    render(<ImportProgress progress={{ processed: 1, total: 10 }} />)
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull()
  })

  it("offers cancellation while running", () => {
    const onCancel = vi.fn()
    render(<ImportProgress progress={{ processed: 1, total: 10 }} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole("button", { name: "Cancel import" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("disables cancel and says so while cancelling", () => {
    render(<ImportProgress progress={{ processed: 1, total: 10 }} onCancel={vi.fn()} isCancelling />)

    const button = screen.getByRole("button", { name: "Cancelling…" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})
