"use client"

import { useState } from "react"
import { Check, Eye, EyeOff, Lock, Pencil, Trash2, Unlock, X } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { Slider } from "@/shared/components/ui/slider"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog"
import { useDeleteLayer, useRenameLayer } from "@/features/database/hooks/useLayers"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { useEditingStore } from "@/features/database/store/editingStore"
import { cn } from "@/shared/lib/utils"
import type { Layer } from "@/shared/contracts/layer.schema"

interface LayerTreeItemProps {
  layer: Layer
  projectId: string
}

/**
 * A single Layer Tree row (US1) — rename, delete, visibility, lock, active
 * selection, and opacity. Rename/delete reuse the existing
 * `useRenameLayer`/`useDeleteLayer` hooks; visibility/lock/opacity are
 * session-only `editingStore` state (FR-003/FR-004/FR-006a), already
 * respected by `FeatureLayer`'s rendering.
 */
export function LayerTreeItem({ layer, projectId }: LayerTreeItemProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftName, setDraftName] = useState(layer.name)

  const selectedLayerId = useDatabaseStore((s) => s.selectedLayerId)
  const selectLayer = useDatabaseStore((s) => s.selectLayer)

  const isLocked = useEditingStore((s) => s.isLayerLocked(layer.id))
  const lockLayer = useEditingStore((s) => s.lockLayer)
  const unlockLayer = useEditingStore((s) => s.unlockLayer)
  const display = useEditingStore((s) => s.getLayerDisplay(layer.id))
  const setLayerVisibility = useEditingStore((s) => s.setLayerVisibility)
  const setLayerOpacity = useEditingStore((s) => s.setLayerOpacity)
  const setContextMenuTarget = useEditingStore((s) => s.setContextMenuTarget)

  const renameLayer = useRenameLayer(layer.id, projectId)
  const deleteLayer = useDeleteLayer(layer.id, projectId)

  const isActive = selectedLayerId === layer.id

  function handleRenameSubmit() {
    const name = draftName.trim()
    if (!name || name === layer.name) {
      setIsRenaming(false)
      setDraftName(layer.name)
      return
    }
    renameLayer.mutate({ name }, { onSuccess: () => setIsRenaming(false) })
  }

  function handleRenameCancel() {
    setDraftName(layer.name)
    setIsRenaming(false)
  }

  return (
    <div className={cn("flex items-center gap-1 rounded-md px-2 py-1.5", isActive && "bg-accent")}>
      <div
        role={isRenaming ? undefined : "button"}
        tabIndex={isRenaming ? undefined : 0}
        aria-current={isActive}
        aria-label={isRenaming ? undefined : `Select layer ${layer.name}`}
        onClick={() => {
          if (!isRenaming) selectLayer(layer.id)
        }}
        onKeyDown={(event) => {
          if (!isRenaming && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault()
            selectLayer(layer.id)
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          setContextMenuTarget({
            kind: "layer",
            id: layer.id,
            clientX: event.clientX,
            clientY: event.clientY,
          })
        }}
        className="flex-1 truncate text-left text-sm"
      >
        {isRenaming ? (
          <input
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleRenameSubmit()
              if (event.key === "Escape") handleRenameCancel()
            }}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Rename layer ${layer.name}`}
            className="w-full rounded border border-input bg-background px-1 text-sm"
          />
        ) : (
          layer.name
        )}
      </div>

      {isRenaming ? (
        <>
          <Button variant="ghost" size="icon" aria-label="Confirm rename" onClick={handleRenameSubmit}>
            <Check className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Cancel rename" onClick={handleRenameCancel}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="icon" aria-label="Rename layer" onClick={() => setIsRenaming(true)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        aria-label={display.visible ? "Hide layer" : "Show layer"}
        onClick={() => setLayerVisibility(layer.id, !display.visible)}
      >
        {display.visible ? (
          <Eye className="h-4 w-4" aria-hidden="true" />
        ) : (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        aria-label={isLocked ? "Unlock layer" : "Lock layer"}
        onClick={() => (isLocked ? unlockLayer(layer.id) : lockLayer(layer.id))}
      >
        {isLocked ? (
          <Lock className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Unlock className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>

      <div className="w-16 px-1">
        <Slider
          value={[display.opacity]}
          min={0}
          max={1}
          step={0.05}
          onValueChange={([value]) => setLayerOpacity(layer.id, value)}
          aria-label={`Opacity for layer ${layer.name}`}
        />
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Delete layer">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{layer.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the layer and all of its features. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteLayer.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
