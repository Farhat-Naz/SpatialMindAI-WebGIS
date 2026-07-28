"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout"
import { Button } from "@/shared/components/ui/button"
import { useSaveLayout } from "../hooks/useWidgets"
import { useUpdateWidget } from "../hooks/useWidgets"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import { GRID_COLUMNS } from "../types/dashboardConfig.constants"
import type { DashboardBreakpoint } from "../services/breakpoint"
import type { DashboardWidgetRecord, WidgetLayoutRecord } from "../types/dashboard.types"
import { WidgetRenderer } from "./WidgetRenderer"

const ROW_HEIGHT_PX = 60
const KEYBOARD_STEP = 1

interface DashboardGridProps {
  dashboardId: string
  widgets: DashboardWidgetRecord[]
  layouts: WidgetLayoutRecord[]
  activeBreakpoint: DashboardBreakpoint
  canEdit: boolean
}

/**
 * `react-grid-layout` integration (US3) — feeds it the `WidgetLayout` rows
 * for the currently-active breakpoint tier (T135's shell selects which tier)
 * and persists position/size changes via `useSaveLayout`, debounced at the
 * call site: only `onDragStop`/`onResizeStop` fire a save, never
 * `onDrag`/`onResize`'s per-frame callbacks (T149/T151).
 *
 * Collision/reflow (T152) and integer-unit snapping (T150) are the
 * library's own default behavior (`verticalCompactor`, grid-unit position
 * calculation) — not re-implemented here.
 */
export function DashboardGrid({ dashboardId, widgets, layouts, activeBreakpoint, canEdit }: DashboardGridProps) {
  const isEditMode = useDashboardBuilderStore((state) => state.isEditMode)
  const setLastError = useDashboardBuilderStore((state) => state.setLastError)
  const saveLayout = useSaveLayout(dashboardId)
  const updateWidget = useUpdateWidget(dashboardId)
  const { width, containerRef, mounted } = useContainerWidth()
  const [groupMode, setGroupMode] = useState(false)
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([])

  const cols = GRID_COLUMNS[activeBreakpoint]

  const layoutForTier = useMemo(
    () => layouts.filter((layout) => layout.breakpoint === activeBreakpoint),
    [layouts, activeBreakpoint],
  )

  const rglLayout: Layout = useMemo(
    () => layoutForTier.map((layout) => ({ i: layout.widgetId, x: layout.x, y: layout.y, w: layout.w, h: layout.h })),
    [layoutForTier],
  )

  const widgetsById = useMemo(() => new Map(widgets.map((widget) => [widget.id, widget])), [widgets])

  // T301/research.md Decision 16 — viewport-gated lazy mount: a widget's
  // own `useWidgetData` (T095) stays disabled until its wrapper node has
  // actually intersected the viewport at least once, so opening a
  // 100-widget dashboard doesn't fire 100 simultaneous data fetches.
  // `rootMargin` pre-warms slightly-below-the-fold widgets so scrolling to
  // them doesn't show a fetch-then-loading flash. One widget, once seen,
  // stays mounted (`unobserve`d) rather than toggling on every scroll.
  const [inViewWidgetIds, setInViewWidgetIds] = useState<Set<string>>(new Set())
  const observerRef = useRef<IntersectionObserver | null>(null)
  // Constructed synchronously during render (not inside `useEffect`), so
  // `observerRef.current` is already populated by the time each widget
  // wrapper's `ref` callback fires during the very same commit — a
  // `useEffect`-created observer would still be `null` when those refs
  // attach, silently skipping `observe()` for every widget on first mount.
  if (observerRef.current === null && typeof IntersectionObserver !== "undefined") {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const newlyVisible = entries.filter((entry) => entry.isIntersecting)
        if (newlyVisible.length === 0) return
        setInViewWidgetIds((previous) => {
          const next = new Set(previous)
          for (const entry of newlyVisible) {
            next.add((entry.target as HTMLElement).dataset.widgetId ?? "")
            observerRef.current?.unobserve(entry.target)
          }
          return next
        })
      },
      { rootMargin: "200px" },
    )
  }

  useEffect(() => {
    return () => observerRef.current?.disconnect()
  }, [])

  const registerWidgetNode = useCallback((node: HTMLDivElement | null) => {
    if (node) observerRef.current?.observe(node)
  }, [])

  const persist = useCallback(
    (next: Layout) => {
      saveLayout.mutate(
        {
          breakpoint: activeBreakpoint,
          items: next.map((item) => ({ widgetId: item.i, x: item.x, y: item.y, w: item.w, h: item.h })),
        },
        {
          // T290 — a layout-save failure is a dashboard-level ("non-widget")
          // failure: nothing about any single widget's own render is wrong,
          // so it surfaces via `dashboardBuilderStore.lastError`'s banner
          // rather than any per-widget error state.
          onError: (error) => {
            setLastError(error instanceof Error ? error.message : "Failed to save the layout change.")
          },
        },
      )
    },
    [saveLayout, activeBreakpoint, setLastError],
  )

  function moveOrResizeByKeyboard(widgetId: string, delta: Partial<{ x: number; y: number; w: number; h: number }>) {
    const current = rglLayout.find((item) => item.i === widgetId)
    if (!current) return
    const next = rglLayout.map((item) =>
      item.i === widgetId
        ? {
            ...item,
            x: Math.max(0, item.x + (delta.x ?? 0)),
            y: Math.max(0, item.y + (delta.y ?? 0)),
            w: Math.max(1, item.w + (delta.w ?? 0)),
            h: Math.max(1, item.h + (delta.h ?? 0)),
          }
        : item,
    )
    persist(next)
  }

  function toggleGroupSelection(widgetId: string) {
    setSelectedForGroup((current) =>
      current.includes(widgetId) ? current.filter((id) => id !== widgetId) : [...current, widgetId],
    )
  }

  function applyGrouping() {
    if (selectedForGroup.length < 2) return
    const [groupHeadId, ...members] = selectedForGroup
    for (const memberId of members) {
      updateWidget.mutate({ widgetId: memberId, input: { groupId: groupHeadId } })
    }
    setSelectedForGroup([])
    setGroupMode(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {isEditMode && canEdit && (
        <div className="flex items-center gap-2">
          <Button type="button" variant={groupMode ? "default" : "outline"} size="sm" onClick={() => setGroupMode((v) => !v)}>
            {groupMode ? "Cancel grouping" : "Group widgets"}
          </Button>
          {groupMode && (
            <Button type="button" size="sm" disabled={selectedForGroup.length < 2} onClick={applyGrouping}>
              Group selected ({selectedForGroup.length})
            </Button>
          )}
        </div>
      )}

      <div ref={containerRef} className="w-full">
        {mounted && (
          <GridLayout
            width={width}
            layout={rglLayout}
            gridConfig={{ cols, rowHeight: ROW_HEIGHT_PX, margin: [8, 8] }}
            dragConfig={{ enabled: isEditMode && canEdit && !groupMode }}
            resizeConfig={{ enabled: isEditMode && canEdit && !groupMode }}
            onDragStop={(layout) => persist(layout)}
            onResizeStop={(layout) => persist(layout)}
          >
            {rglLayout.map((item) => {
              const widget = widgetsById.get(item.i)
              if (!widget) return null
              const isSelected = selectedForGroup.includes(widget.id)

              return (
                <div
                  key={item.i}
                  tabIndex={isEditMode && canEdit ? 0 : undefined}
                  role={groupMode ? "checkbox" : undefined}
                  aria-checked={groupMode ? isSelected : undefined}
                  aria-label={groupMode ? `Select ${widget.title ?? widget.type} for grouping` : undefined}
                  onClick={groupMode ? () => toggleGroupSelection(widget.id) : undefined}
                  onKeyDown={(event) => {
                    if (!isEditMode || !canEdit || groupMode) return
                    const step = KEYBOARD_STEP
                    switch (event.key) {
                      case "ArrowUp":
                        event.preventDefault()
                        moveOrResizeByKeyboard(widget.id, event.shiftKey ? { h: -step } : { y: -step })
                        break
                      case "ArrowDown":
                        event.preventDefault()
                        moveOrResizeByKeyboard(widget.id, event.shiftKey ? { h: step } : { y: step })
                        break
                      case "ArrowLeft":
                        event.preventDefault()
                        moveOrResizeByKeyboard(widget.id, event.shiftKey ? { w: -step } : { x: -step })
                        break
                      case "ArrowRight":
                        event.preventDefault()
                        moveOrResizeByKeyboard(widget.id, event.shiftKey ? { w: step } : { x: step })
                        break
                    }
                  }}
                  className={isSelected ? "ring-2 ring-primary" : undefined}
                >
                  {/* `react-grid-layout`'s `GridLayout` clones this outer
                      `<div>` via `cloneElement(child, { ref: ... })` to
                      attach its own drag/resize measurement ref, silently
                      discarding any ref set here — the intersection
                      observer target has to live on an inner node
                      `GridLayout` never touches instead. */}
                  <div ref={registerWidgetNode} data-widget-id={widget.id} className="h-full w-full">
                    <WidgetRenderer
                      dashboardId={dashboardId}
                      widget={widget}
                      canEdit={canEdit}
                      isInView={inViewWidgetIds.has(widget.id)}
                    />
                  </div>
                </div>
              )
            })}
          </GridLayout>
        )}
      </div>
    </div>
  )
}
