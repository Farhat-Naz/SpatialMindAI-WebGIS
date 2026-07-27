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
import { useCreateDashboard } from "../hooks/useDashboards"
import { ApiRequestError } from "@/shared/errors/apiRequestError"

interface CreateDashboardDialogProps {
  projectId: string
  onCreated: (dashboardId: string) => void
  /** Preselected template — the full template grid picker lands in Phase 13; this dialog defaults to "Blank" (`undefined` templateId). */
  templateId?: string
}

/** Name + (for now, implicit Blank) template create flow (FR-001), wired to `useCreateDashboard`. */
export function CreateDashboardDialog({ projectId, onCreated, templateId }: CreateDashboardDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const createDashboard = useCreateDashboard(projectId)

  function reset() {
    setName("")
    setError(null)
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Enter a name for the dashboard.")
      return
    }

    try {
      const result = await createDashboard.mutateAsync({ name: trimmed, templateId })
      setOpen(false)
      reset()
      onCreated(result.dashboard.id)
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.code === "DUPLICATE_NAME"
          ? `A dashboard named "${trimmed}" already exists in this project.`
          : caught instanceof Error
            ? caught.message
            : "Could not create the dashboard.",
      )
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">New dashboard</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New dashboard</DialogTitle>
          <DialogDescription>Give it a name — you can change it later.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label htmlFor="dashboard-name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="dashboard-name"
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleCreate()
            }}
            maxLength={200}
            aria-invalid={error !== null}
            aria-describedby={error ? "dashboard-name-error" : undefined}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          />
          {error && (
            <p id="dashboard-name-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleCreate()} disabled={createDashboard.isPending}>
            {createDashboard.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
