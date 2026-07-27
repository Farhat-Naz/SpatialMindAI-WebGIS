"use client"

import { useEffect, useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { useDashboard } from "../hooks/useDashboards"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import { resolveBreakpoint } from "../services/breakpoint"
import { DashboardGrid } from "./DashboardGrid"
import { DashboardSettingsPanel } from "./DashboardSettingsPanel"
import { DashboardShareDialog } from "./DashboardShareDialog"
import { WidgetConfigPanel } from "./WidgetConfigPanel"

interface DashboardViewProps {
  projectId: string
  dashboardId: string
}

/**
 * Single-dashboard shell (US3) — mounts breakpoint-aware, re-resolving which
 * `WidgetLayout` tier is active as the viewport crosses the mobile/tablet/
 * desktop thresholds (T006/FR-010). The grid itself (`DashboardGrid`,
 * per-widget rendering) mounts inside this shell starting Phase 9; this
 * component owns the header, breakpoint sync, and settings entry point.
 * Layout changes autosave via `useSaveLayout` (Phase 6/9) with no manual
 * "Save Layout" action (FR-009) — there is deliberately no save button here.
 */
export function DashboardView({ projectId, dashboardId }: DashboardViewProps) {
  const { data, isLoading } = useDashboard(dashboardId)
  const activeBreakpoint = useDashboardBuilderStore((state) => state.activeBreakpoint)
  const setActiveBreakpoint = useDashboardBuilderStore((state) => state.setActiveBreakpoint)
  const isEditMode = useDashboardBuilderStore((state) => state.isEditMode)
  const toggleEditMode = useDashboardBuilderStore((state) => state.toggleEditMode)
  const selectedWidgetId = useDashboardBuilderStore((state) => state.selectedWidgetId)
  const clearSelectedWidget = useDashboardBuilderStore((state) => state.clearSelectedWidget)
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false)

  useEffect(() => {
    function handleResize() {
      setActiveBreakpoint(resolveBreakpoint(window.innerWidth))
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [setActiveBreakpoint])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
    )
  }

  if (!data) {
    // Deliberately the same message a truly-nonexistent dashboard would show
    // (non-disclosure, T225) — a non-member with no share must not be able
    // to tell "doesn't exist" apart from "exists but I can't see it."
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <h1 className="text-lg font-semibold">Dashboard not found</h1>
        <p className="text-sm text-muted-foreground">
          This dashboard could not be found. It may not exist, or you may not have access to it.
        </p>
      </div>
    )
  }

  const canEdit = data.dashboard.effectivePermission === "edit" || data.dashboard.effectivePermission === "owner"
  const isReadOnly = data.dashboard.effectivePermission === "view"

  return (
    <div className="flex h-full flex-col" data-active-breakpoint={activeBreakpoint}>
      {isReadOnly && (
        <div role="status" className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-sm">
          <span aria-hidden="true">🔒</span>
          <span>Read-only — you can view this dashboard, but not make changes.</span>
        </div>
      )}

      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">{data.dashboard.name}</h1>
        <div className="flex items-center gap-2">
          <DashboardShareDialog projectId={projectId} dashboard={data.dashboard} />
          {canEdit && (
            <>
              {isEditMode && (
                <Button type="button" size="sm" onClick={() => setIsAddWidgetOpen(true)}>
                  Add widget
                </Button>
              )}
              <Button type="button" variant={isEditMode ? "default" : "outline"} size="sm" onClick={toggleEditMode}>
                {isEditMode ? "Done editing" : "Edit dashboard"}
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <DashboardGrid
          dashboardId={dashboardId}
          widgets={data.dashboard.widgets}
          layouts={data.dashboard.widgets.flatMap((widget) => widget.layouts)}
          activeBreakpoint={activeBreakpoint}
          canEdit={canEdit}
        />
      </div>

      <DashboardSettingsPanel projectId={projectId} dashboard={data.dashboard} />

      <WidgetConfigPanel
        projectId={projectId}
        dashboardId={dashboardId}
        open={isAddWidgetOpen || selectedWidgetId !== null}
        onOpenChange={(open) => {
          setIsAddWidgetOpen(open)
          if (!open) clearSelectedWidget()
        }}
      />
    </div>
  )
}
