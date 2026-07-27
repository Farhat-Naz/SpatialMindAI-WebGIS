import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reportService } from "../reportService"

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

vi.mock("html2canvas", () => ({
  default: vi.fn().mockResolvedValue({ toDataURL: () => TINY_PNG_DATA_URL }),
}))

const fetchMock = vi.fn()

function respondWith(body: unknown, status = 200): void {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status })),
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  respondWith({ report: { id: "report-1", format: "csv" } })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit]
  return { url, init }
}

describe("reportService", () => {
  it("generatePdfReport: captures the DOM, builds a PDF, and logs it with base64 fileContent", async () => {
    const node = document.createElement("div")
    await reportService.generatePdfReport("dash-1", node)

    const { url, init } = lastCall()
    expect(url).toBe("/api/dashboards/dash-1/reports")
    expect(init.method).toBe("POST")
    const body = JSON.parse(init.body as string)
    expect(body.format).toBe("pdf")
    expect(typeof body.fileContent).toBe("string")
    expect(body.fileContent.length).toBeGreaterThan(0)
  })

  it("generateExcelReport/generateCsvReport/generateHtmlReport: log with no fileContent, letting the server generate it", async () => {
    await reportService.generateCsvReport("dash-1")
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ format: "csv", fileContent: undefined })

    await reportService.generateExcelReport("dash-1")
    expect(JSON.parse(lastCall().init.body as string).format).toBe("excel")

    await reportService.generateHtmlReport("dash-1")
    expect(JSON.parse(lastCall().init.body as string).format).toBe("html")
  })

  it("listReports: GETs the project's reports with query params", async () => {
    await reportService.listReports("proj-1", { limit: 5 })
    expect(lastCall().url).toBe("/api/projects/proj-1/reports?limit=5")
  })

  it("createScheduledReport/updateScheduledReport/deleteScheduledReport: correct endpoints and methods", async () => {
    await reportService.createScheduledReport("dash-1", { format: "csv", recurrence: "daily" })
    expect(lastCall().url).toBe("/api/dashboards/dash-1/scheduled-reports")
    expect(lastCall().init.method).toBe("POST")

    await reportService.updateScheduledReport("sched-1", { isActive: false })
    expect(lastCall().url).toBe("/api/scheduled-reports/sched-1")
    expect(lastCall().init.method).toBe("PATCH")

    respondWith(null, 204)
    await reportService.deleteScheduledReport("sched-1")
    expect(lastCall().init.method).toBe("DELETE")
  })
})
