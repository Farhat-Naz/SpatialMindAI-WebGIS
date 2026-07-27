import { useEffect, useState } from "react"
import { MOBILE_MAX_WIDTH, TABLET_MAX_WIDTH } from "../types/dashboardConfig.constants"

export type DashboardBreakpoint = "desktop" | "tablet" | "mobile"

/** Resolves a viewport width to the `WidgetLayout.breakpoint` tier it maps to (FR-010). */
export function resolveBreakpoint(width: number): DashboardBreakpoint {
  if (width <= MOBILE_MAX_WIDTH) return "mobile"
  if (width <= TABLET_MAX_WIDTH) return "tablet"
  return "desktop"
}

/**
 * Reactive-to-resize viewport breakpoint, same `matchMedia` mechanism as the
 * app shell's `useBreakpoint` (`src/features/dashboard/hooks/useBreakpoint.ts`),
 * extended to three tiers since `DashboardGrid` needs to pick which
 * `WidgetLayout` row to render/save, not just a single boolean.
 */
export function useDashboardBreakpoint(): DashboardBreakpoint {
  const [breakpoint, setBreakpoint] = useState<DashboardBreakpoint>(() =>
    typeof window === "undefined" ? "desktop" : resolveBreakpoint(window.innerWidth),
  )

  useEffect(() => {
    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`)
    const tabletQuery = window.matchMedia(`(max-width: ${TABLET_MAX_WIDTH}px)`)

    const update = () => setBreakpoint(resolveBreakpoint(window.innerWidth))
    update()

    mobileQuery.addEventListener("change", update)
    tabletQuery.addEventListener("change", update)
    return () => {
      mobileQuery.removeEventListener("change", update)
      tabletQuery.removeEventListener("change", update)
    }
  }, [])

  return breakpoint
}
