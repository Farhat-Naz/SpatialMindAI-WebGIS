"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useProjects } from "@/features/database/hooks/useProjects"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { LayerTree } from "@/features/database/components/LayerTree"
// Deep imports, matching this feature's convention — the import-export barrel
// would pull the dialogs and their lazily-imported parsers into the sidebar.
import { ImportHistoryPanel } from "@/features/import-export/components/ImportHistoryPanel"
import { importService } from "@/features/import-export/services/importService"
import { queryKeys as interchangeQueryKeys } from "@/features/import-export/services/queryKeys"
import { Button } from "@/shared/components/ui/button"
import { cn } from "@/shared/lib/utils"

/**
 * Project Explorer (US1) — lists the current user's projects and opens the
 * selected project's Layer Tree. Reuses the existing `useProjects` hook and
 * `databaseStore.selectProject`; no new data access.
 *
 * specs/005-import-export (T242) mounts the import/export history panel here,
 * behind a per-project toggle, rather than adding a new top-level route: history
 * belongs beside the project it describes, and the sidebar is where the project
 * is already open.
 */
export function ProjectExplorer() {
  const { data: projects, isLoading } = useProjects()
  const selectedProjectId = useDatabaseStore((s) => s.selectedProjectId)
  const selectProject = useDatabaseStore((s) => s.selectProject)
  const [historyOpenFor, setHistoryOpenFor] = useState<string | null>(null)
  const queryClient = useQueryClient()

  /**
   * Rollback from a history entry. Invalidates the import history plus every
   * layer's feature list — by the `["layers"]` prefix, because the rolled-back
   * job's layer is whichever the entry targeted, and a rollback is rare enough
   * that a broad refresh costs nothing noticeable.
   */
  async function rollbackFromHistory(jobId: string): Promise<number> {
    try {
      const { deletedFeatureCount } = await importService.rollback(jobId)
      return deletedFeatureCount
    } finally {
      if (selectedProjectId) {
        void queryClient.invalidateQueries({
          queryKey: interchangeQueryKeys.importHistoryList(selectedProjectId),
        })
      }
      void queryClient.invalidateQueries({ queryKey: ["layers"] })
    }
  }

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
            {selectedProjectId === project.id && (
              <>
                <LayerTree projectId={project.id} />
                <div className="px-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={historyOpenFor === project.id}
                    onClick={() =>
                      setHistoryOpenFor(historyOpenFor === project.id ? null : project.id)
                    }
                  >
                    {historyOpenFor === project.id ? "Hide history" : "Import / export history"}
                  </Button>
                </div>
                {historyOpenFor === project.id && (
                  <div className="px-2 pt-2">
                    <ImportHistoryPanel
                      projectId={project.id}
                      // The API enforces FR-080's role gate regardless; a Viewer
                      // who clicks Undo gets the server's 403 surfaced.
                      canModify
                      onRollback={rollbackFromHistory}
                    />
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
