"use client"

import { useEffect } from "react"
import {
  MapContainer as LeafletMapContainer,
  TileLayer,
  ZoomControl,
  ScaleControl,
  useMap,
  useMapEvents,
} from "react-leaflet"
import { useMapStore } from "@/features/map/store/mapStore"
import { useDashboardStore } from "@/features/dashboard/store/dashboardStore"
import { useCoordinates } from "@/features/map/hooks/useCoordinates"
import { BASEMAPS } from "@/features/map/constants/basemaps"
import { useSearchStore } from "@/features/search/store/searchStore"
import { useMapSearchIntegration } from "@/features/search/hooks/useMapSearchIntegration"
import { SearchMarker } from "@/features/search/components/SearchMarker"
import { ReverseGeocodePopup } from "@/features/search/components/ReverseGeocodePopup"
import { MapEditingLayer } from "@/features/database/components/MapEditingLayer"

function MapEventHandler() {
  const setMapStatus = useMapStore((s) => s.setMapStatus)

  useEffect(() => {
    setMapStatus("loading")
  }, [setMapStatus])

  useMapEvents({
    load() {
      setMapStatus("ready")
    },
  })

  return null
}

function CoordinatesTracker() {
  useCoordinates()
  return null
}

function SearchMapIntegration() {
  useMapSearchIntegration()
  return null
}

const ZOOM_BUTTON_FOCUS_CLASSES = [
  "focus-visible:outline-2",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-ring",
]

function ZoomControlAccessibility() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    const zoomInButton = container.querySelector<HTMLAnchorElement>(
      ".leaflet-control-zoom-in"
    )
    const zoomOutButton = container.querySelector<HTMLAnchorElement>(
      ".leaflet-control-zoom-out"
    )

    zoomInButton?.setAttribute("aria-label", "Zoom in")
    zoomInButton?.classList.add(...ZOOM_BUTTON_FOCUS_CLASSES)

    zoomOutButton?.setAttribute("aria-label", "Zoom out")
    zoomOutButton?.classList.add(...ZOOM_BUTTON_FOCUS_CLASSES)
  }, [map])

  return null
}

function ResizeHandler() {
  const map = useMap()
  const sidebarState = useDashboardStore((s) => s.sidebarState)

  useEffect(() => {
    const id = setTimeout(() => {
      map.invalidateSize()
    }, 300)

    return () => clearTimeout(id)
  }, [map, sidebarState])

  return null
}

export function MapCore() {
  const center = useMapStore((s) => s.center)
  const zoom = useMapStore((s) => s.zoom)
  const activeBasemapId = useMapStore((s) => s.activeBasemapId)
  const setError = useMapStore((s) => s.setError)
  const reverseGeocodePoint = useSearchStore((s) => s.reverseGeocodePoint)
  const setReverseGeocodePoint = useSearchStore((s) => s.setReverseGeocodePoint)

  const activeBasemap =
    BASEMAPS.find((b) => b.id === activeBasemapId) ?? BASEMAPS[0]

  return (
    <LeafletMapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      className="h-full w-full"
      zoomControl={false}
    >
      <TileLayer
        url={activeBasemap.urlTemplate}
        attribution={activeBasemap.attribution}
        maxZoom={activeBasemap.maxZoom}
        eventHandlers={{
          tileerror: () => setError("Failed to load map tiles"),
        }}
      />
      <ZoomControl position="topright" />
      <ZoomControlAccessibility />
      <ScaleControl imperial={false} />
      <MapEventHandler />
      <CoordinatesTracker />
      <ResizeHandler />
      <SearchMapIntegration />
      <SearchMarker />
      {reverseGeocodePoint && (
        <ReverseGeocodePopup
          point={reverseGeocodePoint}
          onClose={() => setReverseGeocodePoint(null)}
        />
      )}
      <MapEditingLayer />
    </LeafletMapContainer>
  )
}
