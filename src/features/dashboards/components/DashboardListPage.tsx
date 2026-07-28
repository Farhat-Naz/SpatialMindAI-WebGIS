"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog"
import { Button } from "@/shared/components/ui/button"
import { useDashboards, useDeleteDashboard, useDuplicateDashboard, useSetFavorite } from "../hooks/useDashboards"
import { useDashboardAdminOverview } from "../hooks/useDashboardAdmin"
import type { DashboardRecord } from "../types/dashboard.types"
import { CreateDashboardDialog } from "./CreateDashboardDialog"

interface DashboardListPageProps {
  projectId: string
  onOpenDashboard: (dashboardId: string) => void
}

/** Stable reference so `data?.dashboards ?? EMPTY_DASHBOARDS` never destabilizes `useMemo`'s dependency array across renders where `data` is still loading. */
const EMPTY_DASHBOARDS: DashboardRecord[] = []

/**
 * A project's dashboard list (US1) — create/rename-entry/delete/duplicate/
 * favorite, client-side search-as-you-type over the loaded page, and an
 * empty state distinct from the loading state.
 */
export function DashboardListPage({ projectId, onOpenDashboard }: DashboardListPageProps) {
  const [search, setSearch] = useState("")
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  // T302/SC-003 — cursor-stack pagination (mirrors `TableWidget`'s own
  // Previous/Next pattern) so a 100-dashboard project's list view stays
  // responsive: only one page of rows is ever fetched/rendered, never the
  // whole project's dashboard set at once.
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined])
  const cursor = cursorStack[cursorStack.length - 1]

  const { data, isLoading } = useDashboards(projectId, { cursor, favoritesOnly: favoritesOnly || undefined })
  const deleteDashboard = useDeleteDashboard(projectId)
  const duplicateDashboard = useDuplicateDashboard(projectId)
  const setFavorite = useSetFavorite(projectId)
  // T288 — the "hidden navigation" half of the Administration access gate:
  // this query is itself Project-Owner-gated server-side, so its success/
  // failure is the same authoritative signal that decides whether the link
  // even appears; there is no separate, potentially-divergent client-only
  // permission flag to keep in sync with it.
  const adminOverview = useDashboardAdminOverview(projectId)

  const dashboards = data?.dashboards ?? EMPTY_DASHBOARDS
  const filtered = useMemo(() => {
    if (!search.trim()) return dashboards
    const needle = search.trim().toLowerCase()
    return dashboards.filter((dashboard) => dashboard.name.toLowerCase().includes(needle))
  }, [dashboards, search])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">Loading dashboards…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Dashboards</h2>
        <div className="flex items-center gap-2">
          {adminOverview.isSuccess && (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={`/projects/${projectId}/dashboards/admin`}>Administration</Link>
            </Button>
          )}
          <CreateDashboardDialog projectId={projectId} onCreated={onOpenDashboard} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search dashboards…"
          aria-label="Search dashboards"
          className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        />
        <Button
          type="button"
          variant={favoritesOnly ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setFavoritesOnly((value) => !value)
            setCursorStack([undefined])
          }}
        >
          Favorites
        </Button>
      </div>

      {dashboards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No dashboards yet</p>
          <p className="text-sm text-muted-foreground">Create your first dashboard to get started.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dashboards match “{search}”.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {filtered.map((dashboard) => (
            <DashboardListRow
              key={dashboard.id}
              dashboard={dashboard}
              onOpen={() => onOpenDashboard(dashboard.id)}
              onToggleFavorite={() => setFavorite.mutate({ dashboardId: dashboard.id, isFavorite: !dashboard.isFavorite })}
              onDuplicate={() => duplicateDashboard.mutate(dashboard.id)}
              onRequestDelete={() => setPendingDeleteId(dashboard.id)}
            />
          ))}
        </ul>
      )}

      {!search.trim() && (dashboards.length > 0 || cursorStack.length > 1) && (
        <div className="flex items-center justify-end gap-2">
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
      )}

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the dashboard and every widget on it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId) deleteDashboard.mutate(pendingDeleteId)
                setPendingDeleteId(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface DashboardListRowProps {
  dashboard: DashboardRecord
  onOpen: () => void
  onToggleFavorite: () => void
  onDuplicate: () => void
  onRequestDelete: () => void
}

function DashboardListRow({ dashboard, onOpen, onToggleFavorite, onDuplicate, onRequestDelete }: DashboardListRowProps) {
  const canDelete = dashboard.effectivePermission === "owner"

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <button type="button" onClick={onOpen} className="flex-1 text-left text-sm font-medium hover:underline">
        {dashboard.name}
      </button>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={dashboard.isFavorite}
          aria-label={dashboard.isFavorite ? `Remove ${dashboard.name} from favorites` : `Add ${dashboard.name} to favorites`}
          onClick={onToggleFavorite}
        >
          {dashboard.isFavorite ? "★" : "☆"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDuplicate}>
          Duplicate
        </Button>
        {canDelete && (
          <Button type="button" variant="ghost" size="sm" onClick={onRequestDelete}>
            Delete
          </Button>
        )}
      </div>
    </li>
  )
}
