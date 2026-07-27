/** Fallback UI for the per-widget `ErrorBoundary` (research.md Decision 13) — one widget's render failure never blanks the rest of the dashboard. */
export function WidgetErrorFallback() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center" role="alert">
      <p className="text-sm font-medium text-destructive">This widget failed to render</p>
      <p className="text-xs text-muted-foreground">The rest of the dashboard is unaffected.</p>
    </div>
  )
}
