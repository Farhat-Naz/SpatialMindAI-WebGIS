"use client"

import { useEffect, useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { useRenameDashboard, useSetDashboardVisibility } from "../hooks/useDashboards"
import type { DashboardRecord } from "../types/dashboard.types"

interface DashboardSettingsPanelProps {
  projectId: string
  dashboard: DashboardRecord
  shareCount?: number
}

/**
 * Rename (T129) + visibility entry point (T133 — full sharing behavior lands
 * in Phase 12) + read-only metadata (T134). Rename uses an explicit save
 * action rather than firing a request per keystroke (T138) — unlike layout,
 * which autosaves on drag/resize-end (Phase 9).
 */
export function DashboardSettingsPanel({ projectId, dashboard, shareCount }: DashboardSettingsPanelProps) {
  const [draftName, setDraftName] = useState(dashboard.name)
  const renameDashboard = useRenameDashboard(projectId)
  const setVisibility = useSetDashboardVisibility(projectId)

  useEffect(() => {
    setDraftName(dashboard.name)
  }, [dashboard.name])

  const canRename = dashboard.effectivePermission === "edit" || dashboard.effectivePermission === "owner"
  const canChangeVisibility = dashboard.effectivePermission === "owner"
  const hasUnsavedName = draftName.trim() !== dashboard.name && draftName.trim().length > 0

  function saveName() {
    const trimmed = draftName.trim()
    if (!trimmed || trimmed === dashboard.name) return
    renameDashboard.mutate({ dashboardId: dashboard.id, name: trimmed })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="settings-dashboard-name" className="text-sm font-medium">
          Name
        </label>
        <div className="flex items-center gap-2">
          <input
            id="settings-dashboard-name"
            type="text"
            value={draftName}
            disabled={!canRename}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={saveName}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveName()
            }}
            className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm disabled:opacity-50"
          />
          {hasUnsavedName && (
            <Button type="button" size="sm" onClick={saveName} disabled={renameDashboard.isPending}>
              Save
            </Button>
          )}
        </div>
      </div>

      {canChangeVisibility && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Visibility</span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant={dashboard.visibility === "private" ? "default" : "outline"}
              size="sm"
              onClick={() => setVisibility.mutate({ dashboardId: dashboard.id, visibility: "private" })}
            >
              Private
            </Button>
            <Button
              type="button"
              variant={dashboard.visibility === "public" ? "default" : "outline"}
              size="sm"
              onClick={() => setVisibility.mutate({ dashboardId: dashboard.id, visibility: "public" })}
            >
              Public
            </Button>
          </div>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <dt>Owner</dt>
        <dd>{dashboard.ownerId}</dd>
        <dt>Created</dt>
        <dd>{new Date(dashboard.createdAt).toLocaleString()}</dd>
        <dt>Last updated</dt>
        <dd>{new Date(dashboard.updatedAt).toLocaleString()}</dd>
        {shareCount !== undefined && (
          <>
            <dt>Shared with</dt>
            <dd>{shareCount} {shareCount === 1 ? "person" : "people"}</dd>
          </>
        )}
      </dl>
    </div>
  )
}
