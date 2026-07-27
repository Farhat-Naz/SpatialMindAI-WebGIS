import { z } from "zod"

export const reportFormatSchema = z.enum(["pdf", "excel", "csv", "html"])
export type ReportFormatInput = z.infer<typeof reportFormatSchema>

/** `"pdf"` is deliberately excluded — a schedule fires with no browser present to run `html2canvas` (research.md Decision 10). */
export const scheduledReportFormatSchema = z.enum(["excel", "csv", "html"])
export type ScheduledReportFormatInput = z.infer<typeof scheduledReportFormatSchema>

export const createReportRequestSchema = z.object({
  format: reportFormatSchema,
  /** Base64-encoded file bytes when the client already generated the file (e.g. a client-rendered PDF); omitted to let the server generate Excel/CSV/HTML itself. */
  fileContent: z.string().optional(),
})
export type CreateReportRequestInput = z.infer<typeof createReportRequestSchema>

export const listReportsQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>

export const createScheduledReportRequestSchema = z.object({
  format: scheduledReportFormatSchema,
  recurrence: z.enum(["daily", "weekly", "monthly"]),
})
export type CreateScheduledReportRequestInput = z.infer<typeof createScheduledReportRequestSchema>

export const updateScheduledReportRequestSchema = z
  .object({
    recurrence: z.enum(["daily", "weekly", "monthly"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.recurrence !== undefined || value.isActive !== undefined, {
    message: "At least one of recurrence or isActive must be provided.",
  })
export type UpdateScheduledReportRequestInput = z.infer<typeof updateScheduledReportRequestSchema>
