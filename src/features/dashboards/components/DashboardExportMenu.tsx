"use client"

import { useState, type RefObject } from "react"
import { Download } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu"
import { analyticsService } from "../services/analyticsService"
import { dashboardExportService } from "../services/dashboardExportService"
import { useDashboardFilterStore } from "../store/dashboardFilterStore"
import { LARGE_EXPORT_ROW_WARNING_THRESHOLD } from "../types/dashboardConfig.constants"
import type { DashboardWidgetRecord } from "../types/dashboard.types"

interface DashboardExportMenuProps {
  projectId: string
  dashboardId: string
  widgets: DashboardWidgetRecord[]
  /** The dashboard's own root DOM node (T262) — a ref rather than a prop id, since `DashboardView`'s grid re-renders on every layout/data change and a stale element reference would silently capture the wrong content. */
  dashboardElementRef: RefObject<HTMLElement | null>
}

/** Never lets an audit-log write fail or delay an export the user already received (T340). */
function logExportBestEffort(dashboardId: string, format: string, filters: unknown): void {
  dashboardExportService.logExport(dashboardId, format, filters).catch(() => {})
}

interface PendingTableExport {
  layerId: string
  title: string
  format: "csv" | "excel"
  featureCount: number
}

function exportFilename(title: string, format: "csv" | "excel"): string {
  const safeTitle = title.trim() || "table"
  return `${safeTitle}.${format === "excel" ? "xlsx" : "csv"}`
}

/**
 * Export action menu (US9) — whole-dashboard image capture (T262) and
 * per-table-widget CSV/Excel data export (T264/T265), with a soft warning
 * before a very large table export (T268, spec Edge Cases — the export
 * still completes in full either way, this is purely informational, never
 * a silent truncation). T266 — this *is* the "point-in-time snapshot"
 * concept the roadmap outline names; there is no separate snapshot-export
 * path. Per-widget image export (T263) lives on `WidgetRenderer`'s own
 * toolbar instead, scoped to just that widget's DOM node.
 */
export function DashboardExportMenu({ projectId, dashboardId, widgets, dashboardElementRef }: DashboardExportMenuProps) {
  const [pendingTableExport, setPendingTableExport] = useState<PendingTableExport | null>(null)
  const tableWidgets = widgets.filter((widget) => widget.type === "table" && widget.dataSourceId)
  const activeGlobalFilters = useDashboardFilterStore((state) => state.activeGlobalFilters)

  async function handleExportDashboard() {
    const node = dashboardElementRef.current
    if (!node) return
    await dashboardExportService.exportDashboardAsImage(node, "dashboard.png")
    logExportBestEffort(dashboardId, "image", activeGlobalFilters)
  }

  async function requestTableExport(widget: DashboardWidgetRecord, format: "csv" | "excel") {
    const layerId = widget.dataSourceId as string
    const title = widget.title ?? "Table"

    const snapshot = await analyticsService.getAnalyticsSnapshot(projectId, "layerStats", layerId)
    const featureCount = Number((snapshot.data as { featureCount?: number } | null)?.featureCount ?? 0)

    if (featureCount > LARGE_EXPORT_ROW_WARNING_THRESHOLD) {
      setPendingTableExport({ layerId, title, format, featureCount })
      return
    }
    await dashboardExportService.exportTableWidgetData(layerId, format, exportFilename(title, format))
    logExportBestEffort(dashboardId, format, activeGlobalFilters)
  }

  async function confirmPendingExport() {
    if (!pendingTableExport) return
    const { layerId, title, format } = pendingTableExport
    setPendingTableExport(null)
    await dashboardExportService.exportTableWidgetData(layerId, format, exportFilename(title, format))
    logExportBestEffort(dashboardId, format, activeGlobalFilters)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" aria-label="Export">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void handleExportDashboard()}>Export dashboard as image</DropdownMenuItem>
          {tableWidgets.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Export table data</DropdownMenuLabel>
              {tableWidgets.map((widget) => (
                <DropdownMenuSub key={widget.id}>
                  <DropdownMenuSubTrigger>{widget.title ?? "Table"}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onSelect={() => void requestTableExport(widget, "csv")}>CSV</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void requestTableExport(widget, "excel")}>Excel</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={pendingTableExport !== null} onOpenChange={(open) => !open && setPendingTableExport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Large export</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTableExport
                ? `This table has about ${pendingTableExport.featureCount.toLocaleString()} rows and may take a while to export. It will still export in full — continue?`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmPendingExport()}>Export anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
