import { z } from "zod"

const name = z.string().trim().min(1, "Project name must not be empty")
const description = z.string().trim().optional()

/** `POST /api/projects` request body. */
export const createProjectSchema = z.object({
  name,
  description: description.optional(),
})
export type CreateProjectInput = z.infer<typeof createProjectSchema>

/** `PATCH /api/projects/:projectId` request body — at least one field required. */
export const updateProjectSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: "At least one of name or description must be provided",
  })
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

/** Project shape returned by every Projects API response. */
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  ownerId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Project = z.infer<typeof projectSchema>
