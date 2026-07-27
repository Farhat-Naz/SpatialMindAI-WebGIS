"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { useCreateLayer, useLayers, useReorderLayers } from "@/features/database/hooks/useLayers"
import { LayerTreeItem } from "@/features/database/components/LayerTreeItem"
import { ImportExportControls } from "@/features/database/components/ImportExportControls"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { Button } from "@/shared/components/ui/button"

interface LayerTreeProps {
  projectId: string
}

/**
 * Layer Tree (US1) — lists a project's layers in persisted order, supports
 * creating new layers and drag-and-drop reordering (Research Decision 12:
 * native pointer events, no new drag-and-drop library).
 */
export function LayerTree({ projectId }: LayerTreeProps) {
  const { data: layers } = useLayers(projectId)
  const createLayer = useCreateLayer(projectId)
  const reorderLayers = useReorderLayers(projectId)
  const selectedLayerId = useDatabaseStore((s) => s.selectedLayerId)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [newLayerName, setNewLayerName] = useState("")

  const orderedLayers = layers ? [...layers].sort((a, b) => a.order - b.order) : []
  const selectedLayer = orderedLayers.find((layer) => layer.id === selectedLayerId)

  function handleCreate() {
    const name = newLayerName.trim()
    if (!name) return
    createLayer.mutate({ name }, { onSuccess: () => setNewLayerName("") })
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      return
    }
    const ids = orderedLayers.map((layer) => layer.id)
    const fromIndex = ids.indexOf(draggedId)
    const toIndex = ids.indexOf(targetId)
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedId(null)
      return
    }
    const next = [...ids]
    next.splice(fromIndex, 1)
    next.splice(toIndex, 0, draggedId)
    reorderLayers.mutate(next)
    setDraggedId(null)
  }

  return (
    <div className="flex flex-col gap-1 py-1 pl-3">
      <div className="flex items-center gap-1 px-2">
        <input
          type="text"
          value={newLayerName}
          onChange={(event) => setNewLayerName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleCreate()
          }}
          placeholder="New layer name"
          aria-label="New layer name"
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        />
        <Button variant="outline" size="icon" aria-label="Create layer" onClick={handleCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {orderedLayers.map((layer) => (
          <li
            key={layer.id}
            draggable
            onDragStart={() => setDraggedId(layer.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(layer.id)}
          >
            <LayerTreeItem layer={layer} projectId={projectId} />
          </li>
        ))}
      </ul>
      {selectedLayer && (
        <div className="px-2 pt-1">
          <ImportExportControls
            layerId={selectedLayer.id}
            layerName={selectedLayer.name}
            projectId={projectId}
          />
        </div>
      )}
    </div>
  )
}
