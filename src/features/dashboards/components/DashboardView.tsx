"use client"

import { useEffect } from "react"
import { useDashboard } from "../hooks/useDashboards"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import { resolveBreakpoint } from "../services/breakpoint"
import { DashboardSettingsPanel } from "./DashboardSettingsPanel"

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
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">This dashboard could not be found.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" data-active-breakpoint={activeBreakpoint}>
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">{data.dashboard.name}</h1>
      </header>

      {/* DashboardGrid (Phase 9) mounts here, rendering WidgetRenderer per
          widget for the current activeBreakpoint tier. */}
      <div className="flex-1 overflow-auto p-4" />

      <DashboardSettingsPanel projectId={projectId} dashboard={data.dashboard} />
    </div>
  )
}
