"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useMap } from "react-leaflet"
import { bbox as turfBbox, featureCollection as turfFeatureCollection } from "@turf/turf"
import { Locate } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { useEditingStore } from "@/features/database/store/editingStore"
import { useLayers } from "@/features/database/hooks/useLayers"
import { queryKeys } from "@/features/database/services/queryKeys"
import type { Feature } from "@/shared/contracts/feature.schema"

/**
 * "Fit to data" (US2, FR-016) — frames the combined extent of every
 * currently visible layer's features, distinct from "zoom to layer"
 * (single layer, `LayerContextMenu`'s action). Reads each visible layer's
 * features straight from the React Query cache (already populated by
 * `FeatureLayer`'s own `useFeatures` calls) instead of calling
 * `useFeatures` in a loop, which the Rules of Hooks don't allow for a
 * dynamic layer count. Must be rendered inside a `<MapContainer>`.
 */
export function FitToDataButton() {
  const map = useMap()
  const queryClient = useQueryClient()
  const selectedProjectId = useDatabaseStore((s) => s.selectedProjectId)
  const getLayerDisplay = useEditingStore((s) => s.getLayerDisplay)
  const setLastError = useEditingStore((s) => s.setLastError)
  const { data: layers } = useLayers(selectedProjectId ?? "")

  function handleFitToData() {
    const visibleLayers = (layers ?? []).filter((layer) => getLayerDisplay(layer.id).visible)

    const allFeatures = visibleLayers.flatMap((layer) => {
      const cached = queryClient.getQueryData<{ features: Feature[] }>(queryKeys.features(layer.id))
      return cached?.features ?? []
    })

    if (allFeatures.length === 0) {
      setLastError("No visible features to fit to.")
      return
    }

    const collection = turfFeatureCollection(
      allFeatures.map((feature) => ({
        type: "Feature" as const,
        properties: {},
        geometry: feature.geometry,
      })),
    )
    const [west, south, east, north] = turfBbox(collection)
    map.fitBounds([
      [south, west],
      [north, east],
    ])
  }

  return (
    <Button variant="outline" size="icon" aria-label="Fit to data" onClick={handleFitToData}>
      <Locate className="h-4 w-4" aria-hidden="true" />
    </Button>
  )
}
