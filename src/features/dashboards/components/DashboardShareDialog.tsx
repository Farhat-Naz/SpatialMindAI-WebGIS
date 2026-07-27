"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog"
import { Button } from "@/shared/components/ui/button"
import { useDashboardShares, useGrantShare, useRevokeShare } from "../hooks/useDashboardShares"
import { useSetDashboardVisibility } from "../hooks/useDashboards"
import type { DashboardRecord } from "../types/dashboard.types"

interface DashboardShareDialogProps {
  projectId: string
  dashboard: DashboardRecord
}

/**
 * Sharing (US7) — grant/revoke view/edit shares and the public/private
 * visibility toggle, gated to the dashboard owner or project Owner
 * (`effectivePermission: "owner"`; the visibility toggle completes T133's
 * entry point). Opens from `DashboardSettingsPanel`/`DashboardView`'s share
 * action.
 */
export function DashboardShareDialog({ projectId, dashboard }: DashboardShareDialogProps) {
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState("")
  const [permission, setPermission] = useState<"view" | "edit">("view")

  const { data } = useDashboardShares(dashboard.id)
  const grantShare = useGrantShare(dashboard.id)
  const revokeShare = useRevokeShare(dashboard.id)
  const setVisibility = useSetDashboardVisibility(projectId)

  const canManage = dashboard.effectivePermission === "owner"
  if (!canManage) return null

  const shares = data?.shares ?? []

  function handleGrant() {
    if (!userId.trim()) return
    grantShare.mutate({ userId: userId.trim(), permission })
    setUserId("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share dashboard</DialogTitle>
          <DialogDescription>Grant specific people access, or make the whole dashboard public.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Visibility</span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant={dashboard.visibility === "private" ? "default" : "outline"}
              size="sm"
              onClick={() => setVisibility.mutate({ dashboardId: dashboard.id, visibility: "private" })}
            >
              Private
            </Button>
            <Button
              type="button"
              variant={dashboard.visibility === "public" ? "default" : "outline"}
              size="sm"
              onClick={() => setVisibility.mutate({ dashboardId: dashboard.id, visibility: "public" })}
            >
              Public
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="share-user-id" className="text-sm font-medium">
            Share with a person
          </label>
          <div className="flex gap-2">
            <input
              id="share-user-id"
              type="text"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="User ID"
              className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            />
            <select
              aria-label="Permission"
              value={permission}
              onChange={(event) => setPermission(event.target.value as "view" | "edit")}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            >
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
            <Button type="button" onClick={handleGrant}>
              Grant
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">People with access</span>
          {shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one else has been granted access.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {shares.map((share) => (
                <li key={share.id} className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                  <span>
                    {share.userId} · {share.permission}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => revokeShare.mutate(share.userId)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
