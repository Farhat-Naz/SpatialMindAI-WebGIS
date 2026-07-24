import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "@/shared/contracts/project.schema"
import { apiFetch } from "./apiFetch"

/** Client-side fetch wrappers for the Projects API — the only caller-facing path to `/api/projects*`. */
export const projectService = {
  /** Lists the current user's projects. */
  list(): Promise<{ projects: Project[] }> {
    return apiFetch("/api/projects")
  },
  /** Creates a project owned by the current user. */
  create(input: CreateProjectInput): Promise<{ project: Project }> {
    return apiFetch("/api/projects", { method: "POST", body: JSON.stringify(input) })
  },
  /** Fetches a single project by id. */
  get(projectId: string): Promise<{ project: Project }> {
    return apiFetch(`/api/projects/${projectId}`)
  },
  /** Updates a project's name and/or description. */
  update(projectId: string, input: UpdateProjectInput): Promise<{ project: Project }> {
    return apiFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    })
  },
  /** Deletes a project; the server cascades to every layer/feature/attribute/style beneath it. */
  remove(projectId: string): Promise<void> {
    return apiFetch(`/api/projects/${projectId}`, { method: "DELETE" })
  },
}
