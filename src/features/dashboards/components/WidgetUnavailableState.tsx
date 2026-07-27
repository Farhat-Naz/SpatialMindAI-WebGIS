/** The FR-040 "data source no longer available" render branch (research.md Decision 13) — data, not a thrown error, so this is an ordinary conditional in `WidgetRenderer`, not a caught exception. */
export function WidgetUnavailableState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center" role="status">
      <p className="text-sm font-medium text-muted-foreground">Data source unavailable</p>
      <p className="text-xs text-muted-foreground">
        The layer or analysis result this widget was bound to no longer exists.
      </p>
    </div>
  )
}
