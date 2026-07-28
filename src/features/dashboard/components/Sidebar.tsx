import Link from "next/link"
import { LayoutDashboard } from "lucide-react"
import type { SidebarState } from "@/shared/types/common.types"
import { cn } from "@/shared/lib/utils"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { SidebarToggle } from "./SidebarToggle"

interface SidebarProps {
  state: SidebarState
  onToggle: () => void
  children?: React.ReactNode
}

export function Sidebar({ state, onToggle, children }: SidebarProps) {
  const isExpanded = state === "expanded"
  // specs/008-dashboard-analytics (T276) — the one permitted app-shell
  // touch: a single link into the Dashboards area (research.md Decision 0),
  // reading the same cross-feature `selectedProjectId` `DashboardLayout`
  // already reads, since dashboards are project-scoped and there is
  // nothing to link to before a project is selected.
  const selectedProjectId = useDatabaseStore((state) => state.selectedProjectId)

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out",
        isExpanded ? "w-64" : "w-14"
      )}
    >
      {selectedProjectId && (
        <Link
          href={`/projects/${selectedProjectId}/dashboards`}
          aria-label="Dashboards"
          title="Dashboards"
          className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
          {isExpanded && <span>Dashboards</span>}
        </Link>
      )}
      {children}
      <SidebarToggle isExpanded={isExpanded} onToggle={onToggle} className="mt-auto" />
    </aside>
  )
}
