import Link from "next/link"

/**
 * Shared chrome for the Dashboards area (T275/US1) — a standalone route
 * tree alongside the app's map-centric single-page shell (`src/app/page.tsx`
 * → `DashboardLayout`, which has no client-side routing of its own). Kept
 * deliberately minimal (just a way back to the map) since `DashboardListPage`/
 * `DashboardView` already own their own headers/toolbars.
 */
export default function DashboardsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="border-b px-4 py-2">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          ← Back to map
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}
