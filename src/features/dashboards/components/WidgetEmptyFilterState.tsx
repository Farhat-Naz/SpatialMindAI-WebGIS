/** US6/FR-022/T257 — a successful fetch that an active filter narrowed to zero results, distinct from `WidgetUnavailableState` (a deleted data source, not a filtered-to-zero result). */
export function WidgetEmptyFilterState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center" role="status">
      <p className="text-sm font-medium text-muted-foreground">No data matches the current filters</p>
      <p className="text-xs text-muted-foreground">Try widening the date range or clearing a filter.</p>
    </div>
  )
}
