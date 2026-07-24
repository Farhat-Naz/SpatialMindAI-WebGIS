"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { useFeatures, useUpdateFeature } from "@/features/database/hooks/useFeatures"
import { useEditingStore } from "@/features/database/store/editingStore"

interface AttributeFormProps {
  layerId: string
  featureId: string
}

/**
 * Attribute Form (US3) — dynamic key/value editor over a feature's current
 * attributes, plus independent style fields (color/strokeWidth/
 * fillOpacity). Each facet is saved via its own `useUpdateFeature` call
 * (Research Decision 7), so editing one never touches the others.
 */
export function AttributeForm({ layerId, featureId }: AttributeFormProps) {
  const { data } = useFeatures(layerId)
  const feature = data?.features.find((f) => f.id === featureId)
  const updateFeature = useUpdateFeature(featureId, layerId)
  const setLastError = useEditingStore((s) => s.setLastError)
  const setUndoSnapshot = useEditingStore((s) => s.setUndoSnapshot)

  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")

  if (!feature) return null

  function handleValueChange(key: string, value: string) {
    if (!feature) return
    const previousValue = feature.attributes
    const nextAttributes = feature.attributes.map((entry) =>
      entry.key === key ? { ...entry, value } : entry,
    )
    updateFeature.mutate(
      { attributes: nextAttributes },
      {
        onError: (error) => {
          setLastError(error instanceof Error ? error.message : "Failed to update the attribute.")
        },
        onSuccess: () => {
          setUndoSnapshot({ kind: "attributes", featureId, previousValue })
        },
      },
    )
  }

  function handleAddAttribute() {
    if (!feature) return
    const key = newKey.trim()
    if (!key) return
    if (feature.attributes.some((entry) => entry.key === key)) {
      setLastError(`An attribute named "${key}" already exists on this feature.`)
      return
    }
    const previousValue = feature.attributes
    const nextAttributes = [...feature.attributes, { key, value: newValue }]
    updateFeature.mutate(
      { attributes: nextAttributes },
      {
        onError: (error) => {
          setLastError(error instanceof Error ? error.message : "Failed to add the attribute.")
        },
        onSuccess: () => {
          setUndoSnapshot({ kind: "attributes", featureId, previousValue })
          setNewKey("")
          setNewValue("")
        },
      },
    )
  }

  function handleStyleChange(field: "color" | "strokeWidth" | "fillOpacity", rawValue: string) {
    if (!feature) return
    const previousValue = feature.style
    const nextStyle: { color: string; strokeWidth?: number; fillOpacity?: number } = {
      color: feature.style?.color ?? "#2563eb",
      strokeWidth: feature.style?.strokeWidth,
      fillOpacity: feature.style?.fillOpacity,
    }
    if (field === "color") {
      nextStyle.color = rawValue
    } else {
      nextStyle[field] = rawValue === "" ? undefined : Number(rawValue)
    }
    updateFeature.mutate(
      { style: nextStyle },
      {
        onError: (error) => {
          setLastError(error instanceof Error ? error.message : "Failed to update the style.")
        },
        onSuccess: () => {
          setUndoSnapshot({ kind: "style", featureId, previousValue })
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">Attributes</h3>
        {feature.attributes.map((entry) => (
          <div key={entry.key} className="flex items-center gap-2">
            <span className="w-24 truncate text-sm text-muted-foreground">{entry.key}</span>
            <input
              value={entry.value}
              onChange={(event) => handleValueChange(entry.key, event.target.value)}
              aria-label={`Value for ${entry.key}`}
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            placeholder="New key"
            aria-label="New attribute key"
            className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          />
          <input
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
            placeholder="Value"
            aria-label="New attribute value"
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          />
          <Button variant="outline" size="icon" aria-label="Add attribute" onClick={handleAddAttribute}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">Style</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="style-color" className="w-24 text-sm text-muted-foreground">
            Color
          </label>
          <input
            id="style-color"
            type="color"
            value={feature.style?.color ?? "#2563eb"}
            onChange={(event) => handleStyleChange("color", event.target.value)}
            aria-label="Feature color"
            className="h-8 w-16 rounded-md border border-input bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="style-stroke-width" className="w-24 text-sm text-muted-foreground">
            Stroke width
          </label>
          <input
            id="style-stroke-width"
            type="number"
            min={0}
            value={feature.style?.strokeWidth ?? ""}
            onChange={(event) => handleStyleChange("strokeWidth", event.target.value)}
            aria-label="Stroke width"
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="style-fill-opacity" className="w-24 text-sm text-muted-foreground">
            Fill opacity
          </label>
          <input
            id="style-fill-opacity"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={feature.style?.fillOpacity ?? ""}
            onChange={(event) => handleStyleChange("fillOpacity", event.target.value)}
            aria-label="Fill opacity"
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          />
        </div>
      </div>
    </div>
  )
}
