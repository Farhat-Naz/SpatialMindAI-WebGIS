"use client"

import { useProjects } from "@/features/database/hooks/useProjects"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { LayerTree } from "@/features/database/components/LayerTree"
import { cn } from "@/shared/lib/utils"

/**
 * Project Explorer (US1) — lists the current user's projects and opens the
 * selected project's Layer Tree. Reuses the existing `useProjects` hook and
 * `databaseStore.selectProject`; no new data access.
 */
export function ProjectExplorer() {
  const { data: projects, isLoading } = useProjects()
  const selectedProjectId = useDatabaseStore((s) => s.selectedProjectId)
  const selectProject = useDatabaseStore((s) => s.selectProject)

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2">
      <h2 className="px-2 text-xs font-semibold uppercase text-muted-foreground">Projects</h2>
      {isLoading && <p className="px-2 text-sm text-muted-foreground">Loading projects…</p>}
      <ul className="flex flex-col gap-1">
        {projects?.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              onClick={() => selectProject(project.id)}
              aria-current={selectedProjectId === project.id}
              className={cn(
                "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                selectedProjectId === project.id && "bg-accent font-medium",
              )}
            >
              {project.name}
            </button>
            {selectedProjectId === project.id && <LayerTree projectId={project.id} />}
          </li>
        ))}
      </ul>
    </div>
  )
}
