import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { createDashboard } from "@/server/repositories/dashboardRepository"
import {
  createReport,
  createScheduledReport,
  deleteScheduledReport,
  getReportFileForDownload,
  listReportsForUser,
  runDueScheduledReports,
  updateScheduledReport,
} from "@/server/repositories/reportRepository"
import { REPORT_RETENTION_LIMIT_PER_USER } from "@/features/dashboards/types/dashboardConfig.constants"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("reportRepository", () => {
  let projectId: string
  let dashboardId: string

  beforeEach(async () => {
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Report Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: `Dash ${Date.now()}` })
    dashboardId = dashboard.id
  }, 15000)

  it("createReport: generates a CSV file server-side when fileContent is omitted", async () => {
    await prismaClient.dashboardWidget.create({
      data: { dashboardId, type: "text", config: { content: "hello" } },
    })

    const report = await createReport(dashboardId, TEST_OWNER_ID, { format: "csv" })
    expect(report.status).toBe("succeeded")
    expect(report.sizeBytes).toBeGreaterThan(0)

    const file = await getReportFileForDownload(report.id, TEST_OWNER_ID)
    expect(file?.format).toBe("csv")
    expect(file?.fileContent.length).toBeGreaterThan(0)
  })

  it("createReport: rejects a pdf report with no attached fileContent", async () => {
    await expect(createReport(dashboardId, TEST_OWNER_ID, { format: "pdf" })).rejects.toThrow()
  })

  it("createReport: accepts a client-attached pdf fileContent", async () => {
    const report = await createReport(dashboardId, TEST_OWNER_ID, {
      format: "pdf",
      fileContent: Buffer.from("%PDF-1.4 fake"),
    })
    expect(report.status).toBe("succeeded")
  })

  it("listReportsForUser: never returns fileContent", async () => {
    await createReport(dashboardId, TEST_OWNER_ID, { format: "csv" })
    const { reports } = await listReportsForUser(projectId, TEST_OWNER_ID)
    expect(reports).toHaveLength(1)
    expect(reports[0]).not.toHaveProperty("fileContent")
  })

  it("createReport: prunes the oldest report(s) beyond the retention cap", async () => {
    for (let i = 0; i < REPORT_RETENTION_LIMIT_PER_USER + 2; i += 1) {
      await createReport(dashboardId, TEST_OWNER_ID, { format: "csv" })
    }
    const count = await prismaClient.report.count({ where: { userId: TEST_OWNER_ID } })
    expect(count).toBe(REPORT_RETENTION_LIMIT_PER_USER)
  }, 30000)

  it("createScheduledReport: rejects format 'pdf' before any row is written", async () => {
    await expect(
      // @ts-expect-error — intentionally passing the excluded format to verify the repository-level guard.
      createScheduledReport(dashboardId, TEST_OWNER_ID, { format: "pdf", recurrence: "daily" }),
    ).rejects.toThrow()
    const count = await prismaClient.scheduledReport.count({ where: { dashboardId } })
    expect(count).toBe(0)
  })

  it("updateScheduledReport: pauses a schedule via isActive", async () => {
    const schedule = await createScheduledReport(dashboardId, TEST_OWNER_ID, { format: "csv", recurrence: "daily" })
    const updated = await updateScheduledReport(schedule.id, TEST_OWNER_ID, { isActive: false })
    expect(updated.isActive).toBe(false)
  })

  it("deleteScheduledReport: set-nulls scheduledReportId on previously generated reports", async () => {
    const schedule = await createScheduledReport(dashboardId, TEST_OWNER_ID, { format: "csv", recurrence: "daily" })
    const report = await createReport(dashboardId, TEST_OWNER_ID, { format: "csv", scheduledReportId: schedule.id })

    await deleteScheduledReport(schedule.id, TEST_OWNER_ID)

    const row = await prismaClient.report.findUnique({ where: { id: report.id } })
    expect(row?.scheduledReportId).toBeNull()
  })

  it("runDueScheduledReports: processes a due schedule and advances nextRunAt", async () => {
    const schedule = await prismaClient.scheduledReport.create({
      data: {
        dashboardId,
        userId: TEST_OWNER_ID,
        format: "csv",
        recurrence: "daily",
        nextRunAt: new Date(Date.now() - 1000),
      },
    })

    const summary = await runDueScheduledReports()
    expect(summary.processed).toBeGreaterThanOrEqual(1)

    const updated = await prismaClient.scheduledReport.findUnique({ where: { id: schedule.id } })
    expect(updated!.nextRunAt.getTime()).toBeGreaterThan(schedule.nextRunAt.getTime())

    const report = await prismaClient.report.findFirst({ where: { scheduledReportId: schedule.id } })
    expect(report?.status).toBe("succeeded")
  })

  it("runDueScheduledReports: processes multiple due schedules across different dashboards in one batch", async () => {
    const secondDashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: `Dash2 ${Date.now()}` })

    const scheduleA = await prismaClient.scheduledReport.create({
      data: { dashboardId, userId: TEST_OWNER_ID, format: "csv", recurrence: "daily", nextRunAt: new Date(Date.now() - 1000) },
    })
    const scheduleB = await prismaClient.scheduledReport.create({
      data: {
        dashboardId: secondDashboard.id,
        userId: TEST_OWNER_ID,
        format: "html",
        recurrence: "weekly",
        nextRunAt: new Date(Date.now() - 1000),
      },
    })

    const summary = await runDueScheduledReports()
    expect(summary.processed).toBeGreaterThanOrEqual(2)
    expect(summary.failed).toBe(0)

    const reportA = await prismaClient.report.findFirst({ where: { scheduledReportId: scheduleA.id } })
    const reportB = await prismaClient.report.findFirst({ where: { scheduledReportId: scheduleB.id } })
    expect(reportA?.status).toBe("succeeded")
    expect(reportB?.status).toBe("succeeded")

    const updatedA = await prismaClient.scheduledReport.findUnique({ where: { id: scheduleA.id } })
    const updatedB = await prismaClient.scheduledReport.findUnique({ where: { id: scheduleB.id } })
    expect(updatedA!.nextRunAt.getTime()).toBeGreaterThan(scheduleA.nextRunAt.getTime())
    expect(updatedB!.nextRunAt.getTime()).toBeGreaterThan(scheduleB.nextRunAt.getTime())
  })
})
