import { z } from "zod"

const dashboardName = z.string().trim().min(1).max(200)

export const createDashboardRequestSchema = z.object({
  name: dashboardName,
  templateId: z.string().trim().min(1).optional(),
})
export type CreateDashboardRequestInput = z.infer<typeof createDashboardRequestSchema>

export const updateDashboardRequestSchema = z
  .object({
    name: dashboardName.optional(),
    visibility: z.enum(["private", "public"]).optional(),
  })
  .refine((value) => value.name !== undefined || value.visibility !== undefined, {
    message: "At least one of name or visibility must be provided.",
  })
export type UpdateDashboardRequestInput = z.infer<typeof updateDashboardRequestSchema>

export const listDashboardsQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  favoritesOnly: z.coerce.boolean().optional(),
})
export type ListDashboardsQuery = z.infer<typeof listDashboardsQuerySchema>

export const grantShareRequestSchema = z.object({
  userId: z.string().trim().min(1),
  permission: z.enum(["view", "edit"]),
})
export type GrantShareRequestInput = z.infer<typeof grantShareRequestSchema>
