import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ExportDialog } from "../../components/ExportDialog"
import { ImportDialog } from "../../components/ImportDialog"
import { PrintDialog } from "../../components/PrintDialog"
import { ImportHistoryPanel } from "../../components/ImportHistoryPanel"
import { ValidationReport } from "../../components/ValidationReport"
import { importService } from "../../services/importService"
import { useExportStore } from "../../store/exportStore"
import { useImportStore } from "../../store/importStore"
import type { PreflightResult } from "../../types/importExport.types"

/**
 * Automated accessibility scan (specs/005-import-export, Phase 18).
 *
 * Runs a real `axe-core` scan rather than asserting roles by hand. The existing
 * a11y suites in `features/analysis` note that "a full automated axe scan is
 * deferred to Phase 18" — this is that scan, for this feature's three dialogs
 * plus the two panels with the most conditional structure.
 *
 * ## Rules disabled, and why
 *
 * - `color-contrast` needs real layout and computed styles; jsdom reports no
 *   colours at all, so the rule produces neither true positives nor true
 *   negatives here. Contrast is a Lighthouse/manual check.
 * - `region` (all content in landmarks) is a page-level rule. These components
 *   are rendered in isolation, so there is no page for them to be a region of;
 *   asserting it would be testing the harness.
 *
 * Everything else runs, including the rules that actually matter for this
 * feature: form labelling, ARIA validity, `aria-*` attribute correctness, and
 * name/role/value on every control.
 */

const DISABLED_RULES = { "color-contrast": { enabled: false }, region: { enabled: false } }

/** Scans a container and returns axe's violations. */
async function scan(container: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(container, { rules: DISABLED_RULES })
  return results.violations
}

/** Formats violations so a failure names the rule and the offending markup. */
function describeViolations(violations: axe.Result[]): string {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.html).join("\n    ")}`)
    .join("\n  ")
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function preflightResult(overrides: Partial<PreflightResult> = {}): PreflightResult {
  return {
    features: [
      { sourcePosition: 0, geometry: { type: "Point", coordinates: [1, 1] }, properties: {} },
    ],
    totalFeatures: 25,
    issues: [],
    counts: { rejected: 2, duplicate: 1, repaired: 1 },
    duplicatePositions: [],
    detectedCrs: "EPSG:4326",
    previewBbox: [0, 0, 5, 5],
    ...overrides,
  }
}

beforeEach(() => {
  useImportStore.getState().reset()
  useExportStore.getState().reset()
  vi.spyOn(importService, "listForProject").mockResolvedValue({
    imports: [
      {
        id: "job-1",
        projectId: "proj-1",
        userId: "dev-user-1",
        targetLayerId: "layer-1",
        targetLayerName: "Parcels",
        sourceFormat: "geojson",
        fileName: "parcels.geojson",
        fileSizeBytes: 2048,
        mimeType: "application/geo+json",
        fileHash: null,
        sourceCrs: "EPSG:4326",
        customCrsDefinition: null,
        mode: "lenient",
        columnMapping: null,
        status: "succeeded",
        totalFeatures: 25,
        importedCount: 22,
        rejectedCount: 2,
        duplicateCount: 1,
        repairedCount: 1,
        chunksCommitted: 1,
        errorMessage: null,
        cancelRequestedAt: null,
        heartbeatAt: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
    nextCursor: null,
  } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ImportDialog accessibility", () => {
  it("has no violations at the file-selection step", async () => {
    const { baseElement } = render(
      <ImportDialog open onOpenChange={vi.fn()} layerId="l1" layerName="Parcels" projectId="p1" />,
      { wrapper: wrapper() },
    )

    const violations = await scan(baseElement)
    expect(violations, describeViolations(violations)).toEqual([])
  }, 30000)

  it("has no violations at the confirmation gate, including the mode radios", async () => {
    const store = useImportStore.getState()
    store.setFile(new File(["{}"], "parcels.geojson"), "geojson")
    store.setPreflight(preflightResult())
    store.setCrs({ code: "EPSG:4326", bboxPlausible: true })
    store.setStep("parsing")
    useImportStore.getState().setStep("confirming")

    const { baseElement } = render(
      <ImportDialog open onOpenChange={vi.fn()} layerId="l1" layerName="Parcels" projectId="p1" />,
      { wrapper: wrapper() },
    )

    const violations = await scan(baseElement)
    expect(violations, describeViolations(violations)).toEqual([])
  }, 30000)

  it("has no violations when the wrong-CRS warning is showing (FR-090)", async () => {
    const store = useImportStore.getState()
    store.setFile(new File(["{}"], "parcels.geojson"), "geojson")
    store.setPreflight(preflightResult({ previewBbox: [500000, 180000, 530000, 190000] }))
    store.setCrs({ code: "EPSG:4326", bboxPlausible: false })
    store.setStep("parsing")
    useImportStore.getState().setStep("confirming")

    const { baseElement } = render(
      <ImportDialog open onOpenChange={vi.fn()} layerId="l1" layerName="Parcels" projectId="p1" />,
      { wrapper: wrapper() },
    )

    const violations = await scan(baseElement)
    expect(violations, describeViolations(violations)).toEqual([])
  }, 30000)

  it("has no violations while an import is running (progress + cancel)", async () => {
    const store = useImportStore.getState()
    store.setFile(new File(["{}"], "parcels.geojson"), "geojson")
    store.setPreflight(preflightResult())
    store.setCrs({ code: "EPSG:4326", bboxPlausible: true })
    store.setStep("parsing")
    useImportStore.getState().setStep("confirming")
    useImportStore.getState().setStep("running")
    useImportStore.getState().setProgress({ processed: 500, total: 1000 })

    const { baseElement } = render(
      <ImportDialog open onOpenChange={vi.fn()} layerId="l1" layerName="Parcels" projectId="p1" />,
      { wrapper: wrapper() },
    )

    const violations = await scan(baseElement)
    expect(violations, describeViolations(violations)).toEqual([])
  }, 30000)
})

describe("ExportDialog accessibility", () => {
  it("has no violations with every select labelled", async () => {
    const { baseElement } = render(
      <ExportDialog
        open
        onOpenChange={vi.fn()}
        layerId="l1"
        layerName="Parcels"
        projectId="p1"
        selectedFeatureIds={["f1"]}
      />,
      { wrapper: wrapper() },
    )

    const violations = await scan(baseElement)
    expect(violations, describeViolations(violations)).toEqual([])
  }, 30000)

  it("has no violations with the mixed-geometry warning showing (FR-038)", async () => {
    useExportStore.getState().setFormat("shapefile")
    useExportStore.getState().setShapeClasses(["point", "polygon"])

    const { baseElement } = render(
      <ExportDialog open onOpenChange={vi.fn()} layerId="l1" layerName="Parcels" projectId="p1" />,
      { wrapper: wrapper() },
    )

    const violations = await scan(baseElement)
    expect(violations, describeViolations(violations)).toEqual([])
  }, 30000)
})

describe("PrintDialog accessibility", () => {
  it("has no violations across its controls and preview", async () => {
    const { baseElement } = render(
      <PrintDialog
        open
        onOpenChange={vi.fn()}
        projectId="p1"
        name="Parcels"
        getMapElement={() => null}
      />,
      { wrapper: wrapper() },
    )

    const violations = await scan(baseElement)
    expect(violations, describeViolations(violations)).toEqual([])
  }, 30000)
})

describe("ImportHistoryPanel accessibility", () => {
  it("has no violations once history has loaded", async () => {
    const { baseElement, container } = render(
      <ImportHistoryPanel projectId="p1" canModify onRollback={vi.fn()} />,
      { wrapper: wrapper() },
    )

    await waitFor(() => expect(container.textContent).toContain("parcels.geojson"))

    const violations = await scan(baseElement)
    expect(violations, describeViolations(violations)).toEqual([])
  }, 30000)
})

describe("ValidationReport accessibility", () => {
  it("has no violations with a populated issue table", async () => {
    const { baseElement } = render(
      <ValidationReport
        issues={[
          { sourcePosition: 3, category: "duplicate_in_file", message: "Identical to position 1." },
          { sourcePosition: 9, category: "invalid_geometry", message: "The feature has no geometry." },
        ]}
        counts={{ rejected: 1, duplicate: 1, repaired: 0 }}
      />,
    )

    const violations = await scan(baseElement)
    expect(violations, describeViolations(violations)).toEqual([])
  }, 30000)
})
