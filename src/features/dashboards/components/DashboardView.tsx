"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/shared/components/ui/sheet"
import { ErrorBoundary } from "@/shared/components/ErrorBoundary"
import { useDashboard } from "../hooks/useDashboards"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import { resolveBreakpoint } from "../services/breakpoint"
import { DashboardAnalyticsSummary } from "./DashboardAnalyticsSummary"
import { DashboardExportMenu } from "./DashboardExportMenu"
import { DashboardFilterBar } from "./DashboardFilterBar"
import { DashboardGrid } from "./DashboardGrid"
import { DashboardSettingsPanel } from "./DashboardSettingsPanel"
import { DashboardShareDialog } from "./DashboardShareDialog"
import { ReportGenerationDialog } from "./ReportGenerationDialog"
import { ReportHistoryPanel } from "./ReportHistoryPanel"
import { ScheduledReportsPanel } from "./ScheduledReportsPanel"
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
 *
 * Phase 16 final integration: `DashboardFilterBar` (T279) sits above the
 * grid and is always visible regardless of edit mode or permission (filters
 * are a viewer concern, Phase 7's store-split rationale) — a read-only
 * viewer can still filter. Reports (T280) and Settings (T283) are reached
 * via header triggers rather than being permanently inline, since neither
 * needs to be visible by default.
 */
export function DashboardView({ projectId, dashboardId }: DashboardViewProps) {
  const { data, isLoading } = useDashboard(dashboardId)
  const activeBreakpoint = useDashboardBuilderStore((state) => state.activeBreakpoint)
  const setActiveBreakpoint = useDashboardBuilderStore((state) => state.setActiveBreakpoint)
  const isEditMode = useDashboardBuilderStore((state) => state.isEditMode)
  const toggleEditMode = useDashboardBuilderStore((state) => state.toggleEditMode)
  const selectedWidgetId = useDashboardBuilderStore((state) => state.selectedWidgetId)
  const clearSelectedWidget = useDashboardBuilderStore((state) => state.clearSelectedWidget)
  const lastError = useDashboardBuilderStore((state) => state.lastError)
  const clearLastError = useDashboardBuilderStore((state) => state.clearLastError)
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false)
  const [isReportsOpen, setIsReportsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  /** The dashboard's rendered grid, captured for both `DashboardExportMenu` (T262) and `ReportGenerationDialog`'s PDF path (T196/Phase 16). */
  const dashboardElementRef = useRef<HTMLDivElement>(null)

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

  // T290 — a render exception anywhere in the fully-integrated view (any
  // panel, not just a single widget — WidgetRenderer's own per-widget
  // boundary, Phase 9, already isolates those) falls back here instead of
  // blanking the page.
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center gap-2 p-8 text-center" role="alert">
          <h1 className="text-lg font-semibold">This dashboard failed to render</h1>
          <p className="text-sm text-muted-foreground">Try reloading the page.</p>
        </div>
      }
    >
      <div className="flex h-full flex-col" data-active-breakpoint={activeBreakpoint}>
        {lastError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            <span>{lastError}</span>
            <Button type="button" variant="ghost" size="sm" onClick={clearLastError}>
              Dismiss
            </Button>
          </div>
        )}

        {isReadOnly && (
          <div role="status" className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-sm">
            <span aria-hidden="true">🔒</span>
            <span>Read-only — you can view this dashboard, but not make changes.</span>
          </div>
        )}

        <header className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-lg font-semibold">{data.dashboard.name}</h1>
          <div className="flex items-center gap-2">
            <Sheet open={isReportsOpen} onOpenChange={setIsReportsOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Reports
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>Reports</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 py-2">
                  <ReportGenerationDialog
                    projectId={projectId}
                    dashboardId={dashboardId}
                    dashboardElement={dashboardElementRef.current}
                  />
                  <ScheduledReportsPanel dashboardId={dashboardId} />
                  <ReportHistoryPanel projectId={projectId} />
                </div>
              </SheetContent>
            </Sheet>

            <DashboardExportMenu projectId={projectId} widgets={data.dashboard.widgets} dashboardElementRef={dashboardElementRef} />
            <DashboardShareDialog projectId={projectId} dashboard={data.dashboard} />

            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Settings
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dashboard settings</DialogTitle>
                </DialogHeader>
                <DashboardSettingsPanel projectId={projectId} dashboard={data.dashboard} />
              </DialogContent>
            </Dialog>

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

        <DashboardAnalyticsSummary dashboard={data.dashboard} />
        <DashboardFilterBar projectId={projectId} dashboardId={dashboardId} />

        <div className="flex-1 overflow-auto p-4" ref={dashboardElementRef}>
          <DashboardGrid
            dashboardId={dashboardId}
            widgets={data.dashboard.widgets}
            layouts={data.dashboard.widgets.flatMap((widget) => widget.layouts)}
            activeBreakpoint={activeBreakpoint}
            canEdit={canEdit}
          />
        </div>

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
    </ErrorBoundary>
  )
}
