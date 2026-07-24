"use client"

import { useState } from "react"
import { SidebarToggle } from "@/features/dashboard/components/SidebarToggle"
import { ProjectExplorer } from "@/features/database/components/ProjectExplorer"
import { cn } from "@/shared/lib/utils"

/**
 * Right Sidebar (US1) — hosts the Project Explorer/Layer Tree, following the
 * same collapsible pattern as the existing left `Sidebar.tsx` (dashboard
 * feature). Collapse state is local to this component rather than shared
 * global state, since only one sidebar's width needs to react to it.
 */
export function RightSidebar() {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <aside
      aria-label="Project explorer"
      className={cn(
        "flex flex-col overflow-hidden border-l transition-[width] duration-300 ease-in-out",
        isExpanded ? "w-72" : "w-14",
      )}
    >
      <SidebarToggle isExpanded={isExpanded} onToggle={() => setIsExpanded((prev) => !prev)} />
      {isExpanded && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProjectExplorer />
        </div>
      )}
    </aside>
  )
}
