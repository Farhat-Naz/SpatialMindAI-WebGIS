"use client"

import { useMemo, useState } from "react"
import { useFeatures } from "@/features/database/hooks/useFeatures"
import { Button } from "@/shared/components/ui/button"
import type { WidgetProps } from "../../types/widget.types"

/**
 * Sortable, paginated attribute table (US2/FR-005) — reuses the existing
 * cursor-paginated Features API directly (research.md Decision 16) rather
 * than going through `useWidgetData`'s single-fetch dispatch, since a table
 * widget's pagination state is its own concern, not a generic "resolve one
 * value" concern the way every other widget type is. Sorting is client-side
 * over the currently-loaded page only — the Features API has no server-side
 * sort parameter to page against.
 */
export function TableWidget({ widget }: WidgetProps) {
  const config = widget.config as { columns?: string[]; pageSize?: number }
  const layerId = widget.dataSourceId
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined])
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")

  const cursor = cursorStack[cursorStack.length - 1]
  const { data, isLoading } = useFeatures(layerId ?? "", { cursor, limit: config.pageSize ?? 10 })

  const rows = useMemo(() => {
    const features = data?.features ?? []
    const mapped: Record<string, unknown>[] = features.map((feature) => ({
      id: feature.id,
      ...Object.fromEntries(feature.attributes.map((attribute) => [attribute.key, attribute.value])),
    }))
    if (!sortKey) return mapped
    return [...mapped].sort((a, b) => {
      const left = String(a[sortKey] ?? "")
      const right = String(b[sortKey] ?? "")
      return sortDirection === "asc" ? left.localeCompare(right) : right.localeCompare(left)
    })
  }, [data, sortKey, sortDirection])

  if (!layerId) {
    return <p className="p-4 text-sm text-muted-foreground">No layer selected for this table.</p>
  }
  if (isLoading) {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        Loading…
      </p>
    )
  }

  const columns = config.columns ?? (rows[0] ? Object.keys(rows[0]) : [])

  function toggleSort(column: string) {
    if (sortKey === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(column)
      setSortDirection("asc")
    }
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {columns.map((column) => (
              <th key={column} className="p-1 text-left font-medium">
                <button type="button" onClick={() => toggleSort(column)} className="hover:underline">
                  {column}
                  {sortKey === column ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)} className="border-b last:border-0">
              {columns.map((column) => (
                <td key={column} className="p-1">
                  {String(row[column] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-auto flex items-center justify-between gap-2 border-t p-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={cursorStack.length <= 1}
          onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!data?.nextCursor}
          onClick={() => setCursorStack((stack) => [...stack, data?.nextCursor ?? undefined])}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
