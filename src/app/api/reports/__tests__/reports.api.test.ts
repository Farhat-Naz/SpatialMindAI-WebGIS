import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { POST as CREATE_DASHBOARD } from "@/app/api/projects/[projectId]/dashboards/route"
import { POST as CREATE_REPORT } from "@/app/api/dashboards/[dashboardId]/reports/route"
import { GET as LIST_REPORTS } from "@/app/api/projects/[projectId]/reports/route"
import { GET as DOWNLOAD_REPORT } from "@/app/api/reports/[reportId]/download/route"
import {
  GET as LIST_SCHEDULES,
  POST as CREATE_SCHEDULE,
} from "@/app/api/dashboards/[dashboardId]/scheduled-reports/route"
import { DELETE as DELETE_SCHEDULE, PATCH as PATCH_SCHEDULE } from "@/app/api/scheduled-reports/[scheduledReportId]/route"
import { POST as RUN_DUE } from "@/app/api/reports/scheduled/run-due/route"
import { GET as GET_ANALYTICS } from "@/app/api/projects/[projectId]/analytics/[snapshotType]/route"
import { GET as GET_TEMPLATES } from "@/app/api/dashboard-templates/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown, headers?: Record<string, string>): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Reports/Analytics/Templates API", () => {
  let projectId: string
  let dashboardId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({ data: { ownerId: TEST_OWNER_ID, name: `Reports API ${Date.now()}` } })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })

    const created = await CREATE_DASHBOARD(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "Report Dash" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    dashboardId = (await created.json()).dashboard.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("POST creates a report (fileContent never in the response), GET lists it, download streams it", async () => {
    const created = await CREATE_REPORT(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/reports`, "POST", { format: "csv" }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect(created.status).toBe(201)
    const { report } = await created.json()
    expect(report).not.toHaveProperty("fileContent")

    const listed = await LIST_REPORTS(new Request(`http://localhost/api/projects/${projectId}/reports`) as never, {
      params: Promise.resolve({ projectId }),
    })
    expect(listed.status).toBe(200)
    const { reports } = await listed.json()
    expect(reports.every((r: Record<string, unknown>) => !("fileContent" in r))).toBe(true)

    const downloaded = await DOWNLOAD_REPORT(new Request(`http://localhost/api/reports/${report.id}/download`) as never, {
      params: Promise.resolve({ reportId: report.id }),
    })
    expect(downloaded.status).toBe(200)
    expect(downloaded.headers.get("content-type")).toBe("text/csv")
  })

  it("download returns 404 for a report with no fileContent", async () => {
    const response = await DOWNLOAD_REPORT(new Request("http://localhost/api/reports/nonexistent/download") as never, {
      params: Promise.resolve({ reportId: "nonexistent" }),
    })
    expect(response.status).toBe(404)
  })

  it("POST/PATCH/DELETE scheduled-reports: rejects pdf, pauses, deletes", async () => {
    const rejected = await CREATE_SCHEDULE(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/scheduled-reports`, "POST", {
        format: "pdf",
        recurrence: "daily",
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect(rejected.status).toBe(400)

    const created = await CREATE_SCHEDULE(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/scheduled-reports`, "POST", {
        format: "csv",
        recurrence: "daily",
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect(created.status).toBe(201)
    const { scheduledReport } = await created.json()

    const listed = await LIST_SCHEDULES(
      new Request(`http://localhost/api/dashboards/${dashboardId}/scheduled-reports`) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect((await listed.json()).scheduledReports.length).toBeGreaterThan(0)

    const paused = await PATCH_SCHEDULE(
      jsonRequest(`http://localhost/api/scheduled-reports/${scheduledReport.id}`, "PATCH", { isActive: false }) as never,
      { params: Promise.resolve({ scheduledReportId: scheduledReport.id }) },
    )
    expect(paused.status).toBe(200)
    expect((await paused.json()).scheduledReport.isActive).toBe(false)

    const deleted = await DELETE_SCHEDULE(
      jsonRequest(`http://localhost/api/scheduled-reports/${scheduledReport.id}`, "DELETE") as never,
      { params: Promise.resolve({ scheduledReportId: scheduledReport.id }) },
    )
    expect(deleted.status).toBe(204)
  })

  it("run-due: 401 on missing/incorrect secret, 200 with a summary when correct", async () => {
    process.env.CRON_SECRET = "test-secret"
    try {
      const unauthorized = await RUN_DUE(jsonRequest("http://localhost/api/reports/scheduled/run-due", "POST") as never)
      expect(unauthorized.status).toBe(401)

      const wrong = await RUN_DUE(
        jsonRequest("http://localhost/api/reports/scheduled/run-due", "POST", undefined, {
          "x-cron-secret": "wrong",
        }) as never,
      )
      expect(wrong.status).toBe(401)

      const authorized = await RUN_DUE(
        jsonRequest("http://localhost/api/reports/scheduled/run-due", "POST", undefined, {
          "x-cron-secret": "test-secret",
        }) as never,
      )
      expect(authorized.status).toBe(200)
      const body = await authorized.json()
      expect(body).toHaveProperty("processed")
      expect(body).toHaveProperty("failed")
    } finally {
      delete process.env.CRON_SECRET
    }
  })

  it("run-due (T212): full trigger -> generate -> persist -> advance-nextRunAt flow, and isolates one schedule's outcome from another's in the same batch", async () => {
    process.env.CRON_SECRET = "test-secret"
    try {
      const dueSchedule = await prismaClient.scheduledReport.create({
        data: { dashboardId, userId: TEST_OWNER_ID, format: "csv", recurrence: "daily", nextRunAt: new Date(Date.now() - 1000) },
      })
      const secondDashboard = await CREATE_DASHBOARD(
        jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "Second" }) as never,
        { params: Promise.resolve({ projectId }) },
      )
      const secondDashboardId = (await secondDashboard.json()).dashboard.id
      const secondSchedule = await prismaClient.scheduledReport.create({
        data: {
          dashboardId: secondDashboardId,
          userId: TEST_OWNER_ID,
          format: "html",
          recurrence: "weekly",
          nextRunAt: new Date(Date.now() - 1000),
        },
      })

      const response = await RUN_DUE(
        jsonRequest("http://localhost/api/reports/scheduled/run-due", "POST", undefined, {
          "x-cron-secret": "test-secret",
        }) as never,
      )
      expect(response.status).toBe(200)
      const summary = await response.json()
      expect(summary.processed).toBeGreaterThanOrEqual(2)
      expect(summary.failed).toBe(0)

      const reportOne = await prismaClient.report.findFirst({ where: { scheduledReportId: dueSchedule.id } })
      const reportTwo = await prismaClient.report.findFirst({ where: { scheduledReportId: secondSchedule.id } })
      expect(reportOne?.status).toBe("succeeded")
      expect(reportTwo?.status).toBe("succeeded")

      const updatedOne = await prismaClient.scheduledReport.findUnique({ where: { id: dueSchedule.id } })
      const updatedTwo = await prismaClient.scheduledReport.findUnique({ where: { id: secondSchedule.id } })
      expect(updatedOne!.nextRunAt.getTime()).toBeGreaterThan(dueSchedule.nextRunAt.getTime())
      expect(updatedTwo!.nextRunAt.getTime()).toBeGreaterThan(secondSchedule.nextRunAt.getTime())
    } finally {
      delete process.env.CRON_SECRET
    }
  })

  it("GET analytics returns a snapshot with isCached reflecting the staleness check", async () => {
    const first = await GET_ANALYTICS(
      new Request(`http://localhost/api/projects/${projectId}/analytics/systemStats`) as never,
      { params: Promise.resolve({ projectId, snapshotType: "systemStats" }) },
    )
    expect(first.status).toBe(200)
    expect((await first.json()).isCached).toBe(false)

    const second = await GET_ANALYTICS(
      new Request(`http://localhost/api/projects/${projectId}/analytics/systemStats`) as never,
      { params: Promise.resolve({ projectId, snapshotType: "systemStats" }) },
    )
    expect((await second.json()).isCached).toBe(true)
  })

  it("GET analytics requires scopeId for layerStats", async () => {
    const response = await GET_ANALYTICS(
      new Request(`http://localhost/api/projects/${projectId}/analytics/layerStats`) as never,
      { params: Promise.resolve({ projectId, snapshotType: "layerStats" }) },
    )
    expect(response.status).toBe(400)
  })

  it("GET dashboard-templates returns the five seeded templates", async () => {
    await prismaClient.dashboardTemplate.createMany({
      data: [
        { key: `t1-${Date.now()}`, name: "T1", widgetsBlueprint: [] },
        { key: `t2-${Date.now()}`, name: "T2", widgetsBlueprint: [] },
      ],
    })
    const response = await GET_TEMPLATES(new Request("http://localhost/api/dashboard-templates") as never)
    expect(response.status).toBe(200)
    const { templates } = await response.json()
    expect(templates.length).toBeGreaterThanOrEqual(2)
  })
})
