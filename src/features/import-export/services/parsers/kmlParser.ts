import { WGS84_CODE } from "@/shared/contracts/crs.schema"
import type { ImportIssueDraft } from "@/shared/contracts/importIssue.schema"
import type { ParseFile } from "../../types/importExport.types"
import { assertArchiveEntryPath, assertExpansionRatio } from "../../utils/fileGuards"
import { importIssueMessages } from "../../utils/importErrors"
import { normalizeFeatures } from "./normalizeFeatures"

/**
 * KML / KMZ parser (specs/005-import-export, T078 + Phase 10; FR-022–FR-027).
 *
 * KML is **always WGS84** — the specification fixes it, there is no projection
 * element — so `detectedCrs` is EPSG:4326 unconditionally and the CRS step needs
 * no input from the user for this format (FR-024).
 *
 * A `.kmz` is a ZIP holding one `doc.kml` plus its assets. It is unzipped here,
 * client-side, and from that point the two formats are **indistinguishable**:
 * the server sees identical normalized chunks either way, which is why there is
 * no separate KMZ endpoint and no server-side archive extraction at all
 * (research.md Decision 2).
 */

/** Elements KML supports that have no representation in this platform's model (FR-027). */
const UNSUPPORTED_ELEMENTS: { pattern: RegExp; label: string }[] = [
  { pattern: /<GroundOverlay[\s>]/i, label: "Image overlays (GroundOverlay)" },
  { pattern: /<ScreenOverlay[\s>]/i, label: "Screen overlays (ScreenOverlay)" },
  { pattern: /<PhotoOverlay[\s>]/i, label: "Photo overlays (PhotoOverlay)" },
  { pattern: /<NetworkLink[\s>]/i, label: "Links to external KML (NetworkLink)" },
  { pattern: /<Model[\s>]/i, label: "3D models (Model)" },
  { pattern: /<gx:Track[\s>]/i, label: "GPS tracks (gx:Track)" },
]

/**
 * Reads the KML text out of a `.kmz` archive.
 *
 * The entry is not assumed to be named `doc.kml`: while that is the convention,
 * exporters routinely name it after the document, so the first `.kml` entry is
 * taken. Assets (icons, images) are ignored — this platform imports geometry and
 * attributes, not styling resources.
 */
async function readKmz(file: File): Promise<string> {
  const { default: JSZip } = await import("jszip")
  const archive = await JSZip.loadAsync(await file.arrayBuffer())

  let uncompressedTotal = 0
  let kmlEntryName: string | null = null

  for (const [entryName, entry] of Object.entries(archive.files)) {
    if (entry.dir) continue

    const pathGuard = assertArchiveEntryPath(entryName)
    if (!pathGuard.ok) throw new Error(pathGuard.message)

    const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
    uncompressedTotal += typeof declared === "number" ? declared : 0
    const ratioGuard = assertExpansionRatio(file.size, uncompressedTotal)
    if (!ratioGuard.ok) throw new Error(ratioGuard.message)

    if (!kmlEntryName && /\.kml$/i.test(entryName) && !/(^|\/)__MACOSX\//.test(entryName)) {
      kmlEntryName = entryName
    }
  }

  if (!kmlEntryName) {
    throw new Error("This .kmz archive contains no .kml document, so there is nothing to import.")
  }
  return archive.file(kmlEntryName)!.async("text")
}

/**
 * Builds the `Folder` path for each placemark, so KML's organizational hierarchy
 * survives as data (FR-025).
 *
 * `@tmcw/togeojson` flattens folders away entirely — it returns one flat
 * FeatureCollection with no record of nesting. The path is therefore recovered
 * from the DOM directly: for each `Placemark`, walk up its ancestors collecting
 * `Folder/name`, and join with `/`. Placemarks are visited in document order,
 * which is the same order togeojson emits them, so the two align by index.
 */
function folderPaths(document: Document): (string | undefined)[] {
  const placemarks = [...document.getElementsByTagName("Placemark")]

  return placemarks.map((placemark) => {
    const segments: string[] = []
    let node: Element | null = placemark.parentElement

    while (node) {
      if (node.tagName === "Folder" || node.tagName === "Document") {
        // Only a *direct* child `name` describes this folder; a descendant
        // placemark's own `<name>` must not be mistaken for the folder's.
        const nameNode = [...node.children].find((child) => child.tagName === "name")
        const name = nameNode?.textContent?.trim()
        if (name && node.tagName === "Folder") segments.unshift(name)
      }
      node = node.parentElement
    }

    return segments.length > 0 ? segments.join("/") : undefined
  })
}

/**
 * Strips the third ordinate from every position (FR-026).
 *
 * KML coordinates are `longitude,latitude,altitude`. This platform's geometry
 * column is 2D, so altitude is dropped rather than silently persisted where
 * nothing would read it. Reported once per file rather than once per feature —
 * a 10,000-placemark tour would otherwise produce 10,000 identical issues.
 */
function dropAltitude(geometry: unknown): boolean {
  let dropped = false

  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      if (node.length > 2) {
        node.length = 2
        dropped = true
      }
      return
    }
    for (const child of node) walk(child)
  }

  const coordinates = (geometry as { coordinates?: unknown } | null)?.coordinates
  walk(coordinates)
  return dropped
}

export const parseKml: ParseFile = async (file, options) => {
  const isKmz = /\.kmz$/i.test(file.name) || (await file.slice(0, 2).text()) === "PK"
  const text = isKmz ? await readKmz(file) : await file.text()
  options.signal?.throwIfAborted()

  const warnings: ImportIssueDraft[] = []

  // `DOMParser` is a browser built-in — no dependency, and the worker has it.
  const document = new DOMParser().parseFromString(text, "application/xml")
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("This KML file is not well-formed XML, so it cannot be read.")
  }

  for (const { pattern, label } of UNSUPPORTED_ELEMENTS) {
    if (pattern.test(text)) {
      warnings.push({
        sourcePosition: 0,
        category: "unsupported_content",
        message: importIssueMessages.unsupportedContent(label),
      })
    }
  }

  const { kml } = await import("@tmcw/togeojson")
  const collection = kml(document)
  options.signal?.throwIfAborted()

  const paths = folderPaths(document)
  let altitudeDropped = false
  for (const feature of collection.features) {
    if (dropAltitude(feature.geometry)) altitudeDropped = true
  }
  if (altitudeDropped) {
    warnings.push({
      sourcePosition: 0,
      category: "unsupported_content",
      message: importIssueMessages.unsupportedContent("Altitude values, which this platform stores in 2D,"),
    })
  }

  const { features, warnings: normalizeWarnings } = normalizeFeatures(collection.features, {
    signal: options.signal,
    extraProperties: (index) => {
      const path = paths[index]
      return path ? { folderPath: path } : {}
    },
  })

  return {
    features,
    // KML is WGS84 by specification — there is nothing to detect or choose (FR-024).
    detectedCrs: WGS84_CODE,
    warnings: [...warnings, ...normalizeWarnings],
  }
}
