"use client"

import { useState } from "react"
import { Navbar } from "./Navbar"
import { Sidebar } from "./Sidebar"
import { MobileNav } from "./MobileNav"
import { StatusBar } from "./StatusBar"
import { useSidebar } from "../hooks/useSidebar"
import { useBreakpoint } from "../hooks/useBreakpoint"
import { MapContainer } from "@/features/map"
import { RightSidebar } from "@/features/database/components/RightSidebar"
import { AnalysisPanelMount } from "@/features/analysis/components/AnalysisPanel"
import { useKeyboardShortcuts } from "@/features/database/hooks/useKeyboardShortcuts"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { useRealtimeInvalidation } from "@/features/collaboration/hooks/useRealtimeInvalidation"

export function DashboardLayout() {
  const { sidebarState, toggle } = useSidebar()
  const isMobile = useBreakpoint(767)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  useKeyboardShortcuts()

  // specs/006-collaboration (T114): opens the project's SSE connection once
  // a project is active, closes it when the selection changes/unmounts —
  // same integration-point discipline as useKeyboardShortcuts above. A
  // `null` selectedProjectId is a safe no-op (see the hook's own doc).
  const selectedProjectId = useDatabaseStore((state) => state.selectedProjectId)
  useRealtimeInvalidation(selectedProjectId)

  return (
    <>
      <a href="#map" className="sr-only focus:not-sr-only">
        Skip to map
      </a>
      <div className="grid h-screen grid-rows-[auto_1fr_auto] overflow-hidden">
        <Navbar
          onMenuToggle={() => setMobileNavOpen(true)}
          isMobile={isMobile}
        />
        <div className="grid min-h-0 grid-cols-[auto_minmax(0,1fr)_auto] overflow-hidden">
          <div className="col-start-1 hidden md:flex">
            <Sidebar state={sidebarState} onToggle={toggle} />
          </div>
          {isMobile && (
            <MobileNav
              isOpen={mobileNavOpen}
              onClose={() => setMobileNavOpen(false)}
            >
              <Sidebar state={sidebarState} onToggle={toggle} />
            </MobileNav>
          )}
          <div
            id="map"
            tabIndex={-1}
            className="col-start-2 h-full min-h-0 w-full min-w-0"
          >
            <MapContainer className="h-full w-full" />
          </div>
          <div className="col-start-3 hidden md:flex">
            {/* 007-spatial-analysis (T239): the Analysis panel docks
                alongside RightSidebar in the same grid slot, so opening it
                narrows the map rather than covering it — FR-023 requires
                the map stay fully usable with the panel open. */}
            <AnalysisPanelMount />
            <RightSidebar />
          </div>
        </div>
        <StatusBar />
      </div>
    </>
  )
}
