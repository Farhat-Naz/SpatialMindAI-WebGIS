"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/shared/components/ui/button"
import { Slider } from "@/shared/components/ui/slider"
import { featureService, useDatabaseStore, useFeatures } from "@/features/database"
import { useEditingStore } from "@/features/database/store/editingStore"
import { useAnalysisStore, type SpatialQueryPredicate } from "../store/analysisStore"
import { useRunAnalysis } from "../hooks/useAnalysis"
import type { MeasurementDistanceUnit } from "../services/spatialMath"
import type { AnalysisRunRecord } from "../types/analysis.types"
import type { AnalysisRequestInput } from "@/shared/contracts/analysis.schema"

/** Mirrors `analysisOperations.ts`'s server-side `AttributeFilterOperator` union (kept as a small client-local copy — that file is server-only and must not be imported client-side). */
type AttributeFilterOperator = "eq" | "neq" | "contains" | "gt" | "lt" | "gte" | "lte"

/** `nearAnalysis`'s parameter shape only accepts meters/kilometers (analysis.schema.ts's `shortDistanceUnit`), unlike Buffer's full 4-unit set. */
type ShortDistanceUnit = "meters" | "kilometers"

interface OperationConfigFormProps {
  projectId: string
}

/**
 * Per-operationType configuration form (FR-023) — a shared shell dispatching
 * on `analysisStore.selectedOperationType`. Each user-story phase (8–13)
 * adds its own variant here; an operation with no variant yet renders a
 * plain "not yet available" state rather than a broken/empty form.
 */
export function OperationConfigForm({ projectId }: OperationConfigFormProps) {
  const operationType = useAnalysisStore((state) => state.selectedOperationType)

  if (!operationType) {
    return <p className="p-3 text-sm text-muted-foreground">Select an operation from the Toolbox to begin.</p>
  }

  switch (operationType) {
    case "buffer":
      return <BufferForm projectId={projectId} />
    case "spatialJoin":
    case "touches":
    case "crosses":
    case "overlaps":
    case "pointInPolygon":
    case "selectByLocation":
    case "nearAnalysis":
      return <SpatialQueryForm projectId={projectId} />
    case "selectByAttribute":
      return <AttributeQueryForm projectId={projectId} />
    case "union":
    case "intersect":
    case "difference":
    case "clip":
    case "erase":
    case "identity":
    case "symmetricalDifference":
      return <OverlayForm projectId={projectId} operationType={operationType} />
    case "simplify":
      return <SimplifyForm projectId={projectId} />
    case "smoothGeometry":
    case "repairGeometry":
    case "multipartToSinglepart":
    case "singlepartToMultipart":
    case "summarize":
    case "featureCount":
    case "areaCalculation":
    case "averageArea":
    case "lengthCalculation":
    case "totalLength":
    case "averageLength":
    case "boundingBox":
    case "centroid":
    case "convexHull":
    case "extent":
      return <SingleLayerForm projectId={projectId} operationType={operationType} />
    case "densityAnalysis":
      return <DensityForm projectId={projectId} />
    case "dissolve":
      return <DissolveForm projectId={projectId} />
    case "merge":
      return <MergeForm projectId={projectId} />
    case "split":
      return <SplitForm projectId={projectId} />
    default:
      return (
        <p className="p-3 text-sm text-muted-foreground">
          Configuration for &ldquo;{operationType}&rdquo; is not yet available.
        </p>
      )
  }
}

const DISTANCE_UNITS: { value: MeasurementDistanceUnit; label: string }[] = [
  { value: "meters", label: "Meters" },
  { value: "kilometers", label: "Kilometers" },
  { value: "feet", label: "Feet" },
  { value: "miles", label: "Miles" },
]

const SHORT_DISTANCE_UNITS: { value: ShortDistanceUnit; label: string }[] = [
  { value: "meters", label: "Meters" },
  { value: "kilometers", label: "Kilometers" },
]

/** Buffer Analysis form (US1, FR-001–003). */
function BufferForm({ projectId }: { projectId: string }) {
  const stagedInputLayerIds = useAnalysisStore((state) => state.stagedInputLayerIds)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const runAnalysis = useRunAnalysis(projectId)

  const [distance, setDistance] = useState("")
  const [unit, setUnit] = useState<MeasurementDistanceUnit>("meters")
  const [dissolve, setDissolve] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsedDistance = Number(distance)
    if (!distance.trim() || !Number.isFinite(parsedDistance) || parsedDistance <= 0) {
      setValidationError("Distance must be a positive number.")
      return
    }
    if (stagedInputLayerIds.length === 0) {
      setValidationError("Select at least one layer first.")
      return
    }
    setValidationError(null)

    runAnalysis.mutate(
      {
        operationType: "buffer",
        inputLayerIds: [stagedInputLayerIds[0]],
        parameters: { distance: parsedDistance, unit, dissolve },
      },
      {
        onError: (error) => {
          setLastError(error instanceof Error ? error.message : "Failed to run Buffer.")
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Buffer parameters" className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="buffer-distance" className="text-sm text-muted-foreground">
          Distance
        </label>
        <input
          id="buffer-distance"
          type="number"
          min={0}
          step="any"
          value={distance}
          onChange={(event) => setDistance(event.target.value)}
          aria-invalid={Boolean(validationError)}
          aria-describedby={validationError ? "buffer-distance-error" : undefined}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="buffer-unit" className="text-sm text-muted-foreground">
          Unit
        </label>
        <select
          id="buffer-unit"
          value={unit}
          onChange={(event) => setUnit(event.target.value as MeasurementDistanceUnit)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        >
          {DISTANCE_UNITS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="buffer-dissolve"
          type="checkbox"
          checked={dissolve}
          onChange={(event) => setDissolve(event.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <label htmlFor="buffer-dissolve" className="text-sm text-muted-foreground">
          Dissolve results into one shape
        </label>
      </div>

      {validationError && (
        <p id="buffer-distance-error" role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}

      <Button type="submit" disabled={runAnalysis.isPending}>
        {runAnalysis.isPending ? "Running…" : "Run Buffer"}
      </Button>
    </form>
  )
}

const SPATIAL_PREDICATES: { value: SpatialQueryPredicate; label: string }[] = [
  { value: "intersects", label: "Intersects" },
  { value: "within", label: "Within" },
  { value: "contains", label: "Contains" },
  { value: "touches", label: "Touches" },
  { value: "crosses", label: "Crosses" },
  { value: "overlaps", label: "Overlaps" },
  { value: "nearest", label: "Nearest" },
]

/**
 * After a spatial-query run produces a result layer, selects that layer and
 * its (first page of) features so they visibly highlight on the map —
 * reuses `databaseStore`'s existing multi-selection mechanism rather than
 * introducing a parallel one (T146). Best-effort: only the first page of
 * matches is selected, a reasonable bound for a "highlight" convenience
 * rather than a hard guarantee across arbitrarily large result sets.
 */
function useHighlightResultOnMap() {
  const selectLayer = useDatabaseStore((state) => state.selectLayer)
  const selectFeatureRange = useDatabaseStore((state) => state.selectFeatureRange)

  return async (run: AnalysisRunRecord) => {
    if (!run.resultLayerId) return
    selectLayer(run.resultLayerId)
    const { features } = await featureService.list(run.resultLayerId)
    selectFeatureRange(features.map((feature) => feature.id))
  }
}

/** Select by Location — spatial predicate/nearest query (US2, FR-004/FR-005). */
function SpatialQueryForm({ projectId }: { projectId: string }) {
  const stagedInputLayerIds = useAnalysisStore((state) => state.stagedInputLayerIds)
  const spatialQueryPredicate = useAnalysisStore((state) => state.spatialQueryPredicate)
  const setSpatialQueryPredicate = useAnalysisStore((state) => state.setSpatialQueryPredicate)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const runAnalysis = useRunAnalysis(projectId)
  const highlightResult = useHighlightResultOnMap()

  const predicate = spatialQueryPredicate ?? "intersects"
  const [useDistance, setUseDistance] = useState(false)
  const [maxDistance, setMaxDistance] = useState("")
  const [unit, setUnit] = useState<ShortDistanceUnit>("meters")
  const [attributeFilterKey, setAttributeFilterKey] = useState("")
  const [attributeFilterValue, setAttributeFilterValue] = useState("")
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const [sourceLayerId, referenceLayerId] = stagedInputLayerIds
    if (!sourceLayerId || !referenceLayerId) {
      setValidationError("Select a source layer and a reference layer.")
      return
    }
    setValidationError(null)

    const onSuccess = async ({ run }: { run: AnalysisRunRecord }) => {
      // Combined spatial + attribute filter (T148): chain a second,
      // narrower Select by Attribute run against the spatial result —
      // there is no single combined server operation, so this composes
      // two independent runs into the same user-visible flow.
      if (attributeFilterKey.trim() && run.resultLayerId) {
        runAnalysis.mutate(
          {
            operationType: "selectByAttribute",
            inputLayerIds: [run.resultLayerId],
            parameters: { key: attributeFilterKey.trim(), operator: "eq", value: attributeFilterValue },
          },
          {
            onSuccess: ({ run: refinedRun }) => void highlightResult(refinedRun),
            onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to apply the attribute filter."),
          },
        )
        return
      }
      void highlightResult(run)
    }

    if (predicate === "nearest") {
      runAnalysis.mutate(
        {
          operationType: "nearAnalysis",
          inputLayerIds: [sourceLayerId, referenceLayerId],
          parameters: useDistance && maxDistance ? { maxDistance: Number(maxDistance), unit } : undefined,
        },
        { onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to run Nearest.") },
      )
      return
    }

    if (predicate === "touches" || predicate === "crosses" || predicate === "overlaps") {
      runAnalysis.mutate(
        { operationType: predicate, inputLayerIds: [sourceLayerId, referenceLayerId], parameters: undefined },
        {
          onSuccess,
          onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to run the spatial query."),
        },
      )
      return
    }

    runAnalysis.mutate(
      {
        operationType: "spatialJoin",
        inputLayerIds: [sourceLayerId, referenceLayerId],
        parameters: { relationship: predicate },
      },
      {
        onSuccess,
        onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to run the spatial query."),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Select by Location parameters" className="flex flex-col gap-3 p-3">
      <p className="text-sm text-muted-foreground">
        Source and reference layers are the first two layers staged from the Layers panel.
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="query-predicate" className="text-sm text-muted-foreground">
          Relationship
        </label>
        <select
          id="query-predicate"
          value={predicate}
          onChange={(event) => setSpatialQueryPredicate(event.target.value as SpatialQueryPredicate)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        >
          {SPATIAL_PREDICATES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {predicate === "nearest" && (
        <div className="flex items-center gap-2">
          <input
            id="query-use-distance"
            type="checkbox"
            checked={useDistance}
            onChange={(event) => setUseDistance(event.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="query-use-distance" className="text-sm text-muted-foreground">
            Limit by distance
          </label>
        </div>
      )}

      {predicate === "nearest" && useDistance && (
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="query-max-distance" className="text-sm text-muted-foreground">
              Max distance
            </label>
            <input
              id="query-max-distance"
              type="number"
              min={0}
              step="any"
              value={maxDistance}
              onChange={(event) => setMaxDistance(event.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="query-distance-unit" className="text-sm text-muted-foreground">
              Unit
            </label>
            <select
              id="query-distance-unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value as ShortDistanceUnit)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            >
              {SHORT_DISTANCE_UNITS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {predicate !== "nearest" && (
        <fieldset className="flex flex-col gap-1 rounded-md border border-input p-2">
          <legend className="px-1 text-xs text-muted-foreground">Also filter by attribute (optional)</legend>
          <div className="flex gap-2">
            <input
              id="query-attribute-key"
              value={attributeFilterKey}
              onChange={(event) => setAttributeFilterKey(event.target.value)}
              placeholder="Attribute key"
              aria-label="Attribute key"
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            />
            <input
              id="query-attribute-value"
              value={attributeFilterValue}
              onChange={(event) => setAttributeFilterValue(event.target.value)}
              placeholder="Equals value"
              aria-label="Attribute value"
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            />
          </div>
        </fieldset>
      )}

      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}

      <Button type="submit" disabled={runAnalysis.isPending}>
        {runAnalysis.isPending ? "Running…" : "Run Query"}
      </Button>
    </form>
  )
}

const ATTRIBUTE_OPERATORS: { value: AttributeFilterOperator; label: string }[] = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not equals" },
  { value: "contains", label: "Contains" },
  { value: "gt", label: "Greater than" },
  { value: "gte", label: "Greater than or equal" },
  { value: "lt", label: "Less than" },
  { value: "lte", label: "Less than or equal" },
]

/** Select by Attribute (US2, FR-006). */
function AttributeQueryForm({ projectId }: { projectId: string }) {
  const stagedInputLayerIds = useAnalysisStore((state) => state.stagedInputLayerIds)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const runAnalysis = useRunAnalysis(projectId)
  const highlightResult = useHighlightResultOnMap()

  const [key, setKey] = useState("")
  const [operator, setOperator] = useState<AttributeFilterOperator>("eq")
  const [value, setValue] = useState("")
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (stagedInputLayerIds.length === 0) {
      setValidationError("Select at least one layer first.")
      return
    }
    if (!key.trim()) {
      setValidationError("Enter an attribute key.")
      return
    }
    setValidationError(null)

    runAnalysis.mutate(
      {
        operationType: "selectByAttribute",
        inputLayerIds: [stagedInputLayerIds[0]],
        parameters: { key: key.trim(), operator, value },
      },
      {
        onSuccess: ({ run }) => void highlightResult(run),
        onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to run Select by Attribute."),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Select by Attribute parameters" className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="attribute-key" className="text-sm text-muted-foreground">
          Attribute key
        </label>
        <input
          id="attribute-key"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="attribute-operator" className="text-sm text-muted-foreground">
          Operator
        </label>
        <select
          id="attribute-operator"
          value={operator}
          onChange={(event) => setOperator(event.target.value as AttributeFilterOperator)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        >
          {ATTRIBUTE_OPERATORS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="attribute-value" className="text-sm text-muted-foreground">
          Value
        </label>
        <input
          id="attribute-value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        />
      </div>

      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}

      <Button type="submit" disabled={runAnalysis.isPending}>
        {runAnalysis.isPending ? "Running…" : "Run Select by Attribute"}
      </Button>
    </form>
  )
}

type OverlayOperationType = "union" | "intersect" | "difference" | "clip" | "erase" | "identity" | "symmetricalDifference"

const OVERLAY_LABELS: Record<OverlayOperationType, { title: string; first: string; second: string }> = {
  union: { title: "Union", first: "Layer A", second: "Layer B" },
  intersect: { title: "Intersection", first: "Layer A", second: "Layer B" },
  difference: { title: "Difference", first: "Layer A", second: "Layer B (subtracted)" },
  clip: { title: "Clip", first: "Target layer", second: "Clip boundary" },
  erase: { title: "Erase", first: "Target layer", second: "Erase boundary" },
  identity: { title: "Identity", first: "Target layer", second: "Reference layer" },
  symmetricalDifference: { title: "Symmetrical Difference", first: "Layer A", second: "Layer B" },
}

/** Overlay Analysis (US4, FR-010) — Union/Intersection/Difference/Clip/Erase/Identity/Symmetrical Difference, all sharing this same two-layer form shape. */
function OverlayForm({ projectId, operationType }: { projectId: string; operationType: OverlayOperationType }) {
  const stagedInputLayerIds = useAnalysisStore((state) => state.stagedInputLayerIds)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const runAnalysis = useRunAnalysis(projectId)
  const [validationError, setValidationError] = useState<string | null>(null)

  const labels = OVERLAY_LABELS[operationType]
  const [firstLayerId, secondLayerId] = stagedInputLayerIds

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!firstLayerId || !secondLayerId) {
      setValidationError(`Select two layers: ${labels.first} and ${labels.second}.`)
      return
    }
    setValidationError(null)

    // All 7 overlay variants share one request shape (a 2-tuple of layer ids,
    // no parameters), but `operationType` is a union-typed *variable* here,
    // so TypeScript cannot correlate it with a single arm of
    // `AnalysisRequestInput`'s discriminated union. The cast asserts only
    // what analysis.schema.ts already guarantees for these 7 keys.
    const request = {
      operationType,
      inputLayerIds: [firstLayerId, secondLayerId],
      parameters: undefined,
    } as AnalysisRequestInput

    runAnalysis.mutate(request, {
      onError: (error) => setLastError(error instanceof Error ? error.message : `Failed to run ${labels.title}.`),
    })
  }

  return (
    <form onSubmit={handleSubmit} aria-label={`${labels.title} parameters`} className="flex flex-col gap-3 p-3">
      <p className="text-sm text-muted-foreground">
        {labels.first}: {firstLayerId ?? "not staged"} · {labels.second}: {secondLayerId ?? "not staged"}
      </p>
      <p className="text-xs text-muted-foreground">
        Stage two layers from the Layers panel — the first becomes &ldquo;{labels.first}&rdquo;, the second
        &ldquo;{labels.second}&rdquo;.
      </p>

      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}

      <Button type="submit" disabled={runAnalysis.isPending}>
        {runAnalysis.isPending ? "Running…" : `Run ${labels.title}`}
      </Button>
    </form>
  )
}

/**
 * Simplify (US5, FR-011) — a tolerance slider paired with a number input
 * over the same value. The slider gives a quick coarse sweep, the input
 * lets a user type an exact tolerance the slider's step could not land on;
 * both are labelled so either alone is usable by keyboard.
 */
function SimplifyForm({ projectId }: { projectId: string }) {
  const stagedInputLayerIds = useAnalysisStore((state) => state.stagedInputLayerIds)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const runAnalysis = useRunAnalysis(projectId)

  const [tolerance, setTolerance] = useState(0.001)
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const [layerId] = stagedInputLayerIds
    if (!layerId) {
      setValidationError("Select a layer first.")
      return
    }
    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      setValidationError("Tolerance must be a positive number.")
      return
    }
    setValidationError(null)

    runAnalysis.mutate(
      { operationType: "simplify", inputLayerIds: [layerId], parameters: { tolerance } },
      { onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to run Simplify.") },
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Simplify parameters" className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="simplify-tolerance" className="text-sm text-muted-foreground">
          Tolerance (degrees)
        </label>
        <input
          id="simplify-tolerance"
          type="number"
          min={0}
          step="any"
          value={tolerance}
          onChange={(event) => setTolerance(Number(event.target.value))}
          aria-invalid={Boolean(validationError)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        />
      </div>

      <Slider
        thumbLabel="Simplify tolerance"
        min={0.0001}
        max={0.05}
        step={0.0001}
        value={[tolerance]}
        onValueChange={([next]) => setTolerance(next)}
      />

      <p className="text-xs text-muted-foreground">
        A larger tolerance removes more vertices. Features already simpler than the tolerance are reported as
        needing no change.
      </p>

      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}

      <Button type="submit" disabled={runAnalysis.isPending}>
        {runAnalysis.isPending ? "Running…" : "Run Simplify"}
      </Button>
    </form>
  )
}

type SingleLayerOperation =
  | "smoothGeometry"
  | "repairGeometry"
  | "multipartToSinglepart"
  | "singlepartToMultipart"
  | "summarize"
  | "featureCount"
  | "areaCalculation"
  | "averageArea"
  | "lengthCalculation"
  | "totalLength"
  | "averageLength"
  | "boundingBox"
  | "centroid"
  | "convexHull"
  | "extent"

const SINGLE_LAYER_LABELS: Record<SingleLayerOperation, { title: string; description: string }> = {
  smoothGeometry: {
    title: "Smooth",
    description: "Rounds sharp corners using Chaikin smoothing. Attributes are preserved.",
  },
  repairGeometry: {
    title: "Repair Geometry",
    description:
      "Fixes invalid geometry such as self-intersections. Features that cannot be repaired are listed in the result rather than dropped silently.",
  },
  multipartToSinglepart: {
    title: "Multipart to Singlepart",
    description: "Splits each multi-part feature into one feature per part, each keeping the original's attributes.",
  },
  singlepartToMultipart: {
    title: "Singlepart to Multipart",
    description: "Wraps each feature in its multi-part equivalent.",
  },

  // Spatial Statistics (US6) — all read-only: they report numbers about
  // the layer and never create a result layer.
  summarize: {
    title: "Summarize",
    description:
      "Reports feature count, area, length, bounding box, centroid, convex hull, and extent in one pass. No new layer is created.",
  },
  featureCount: { title: "Feature Count", description: "Counts the features in the layer." },
  areaCalculation: { title: "Area Calculation", description: "Total area of the layer's features, in square metres." },
  averageArea: { title: "Average Area", description: "Mean feature area, in square metres." },
  lengthCalculation: { title: "Length Calculation", description: "Total length of the layer's features, in metres." },
  totalLength: { title: "Total Length", description: "Total length of the layer's features, in metres." },
  averageLength: { title: "Average Length", description: "Mean feature length, in metres." },
  boundingBox: { title: "Bounding Box", description: "The rectangle enclosing every feature in the layer." },
  centroid: { title: "Centroid", description: "The centre of mass of the layer's combined geometry." },
  convexHull: { title: "Convex Hull", description: "The smallest convex shape containing every feature." },
  extent: { title: "Extent", description: "The layer's coordinate extent." },
}

/** Every no-parameter operation that takes exactly one layer (US5's geometry conversions and US6's statistics) — a confirm step over one staged layer. */
function SingleLayerForm({
  projectId,
  operationType,
}: {
  projectId: string
  operationType: SingleLayerOperation
}) {
  const stagedInputLayerIds = useAnalysisStore((state) => state.stagedInputLayerIds)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const runAnalysis = useRunAnalysis(projectId)
  const [validationError, setValidationError] = useState<string | null>(null)

  const labels = SINGLE_LAYER_LABELS[operationType]
  const [layerId] = stagedInputLayerIds

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!layerId) {
      setValidationError("Select a layer first.")
      return
    }
    setValidationError(null)

    runAnalysis.mutate(
      { operationType, inputLayerIds: [layerId], parameters: undefined } as AnalysisRequestInput,
      {
        onError: (error) =>
          setLastError(error instanceof Error ? error.message : `Failed to run ${labels.title}.`),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label={`${labels.title} parameters`} className="flex flex-col gap-3 p-3">
      <p className="text-sm text-muted-foreground">Layer: {layerId ?? "not staged"}</p>
      <p className="text-xs text-muted-foreground">{labels.description}</p>

      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}

      <Button type="submit" disabled={runAnalysis.isPending}>
        {runAnalysis.isPending ? "Running…" : `Run ${labels.title}`}
      </Button>
    </form>
  )
}

/**
 * Density Analysis (US6.4, FR-016) — features per unit area, measured
 * over a square grid at the chosen cell size. The grid is summarized
 * rather than persisted, since US6 statistics create no layer.
 */
function DensityForm({ projectId }: { projectId: string }) {
  const stagedInputLayerIds = useAnalysisStore((state) => state.stagedInputLayerIds)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const runAnalysis = useRunAnalysis(projectId)

  const [cellSize, setCellSize] = useState("100")
  const [unit, setUnit] = useState<ShortDistanceUnit>("meters")
  const [validationError, setValidationError] = useState<string | null>(null)

  const [layerId] = stagedInputLayerIds

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!layerId) {
      setValidationError("Select a layer first.")
      return
    }
    const parsed = Number(cellSize)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setValidationError("Cell size must be a positive number.")
      return
    }
    setValidationError(null)

    runAnalysis.mutate(
      { operationType: "densityAnalysis", inputLayerIds: [layerId], parameters: { cellSize: parsed, unit } },
      { onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to run Density Analysis.") },
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Density Analysis parameters" className="flex flex-col gap-3 p-3">
      <p className="text-sm text-muted-foreground">Layer: {layerId ?? "not staged"}</p>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="density-cell-size" className="text-sm text-muted-foreground">
            Cell size
          </label>
          <input
            id="density-cell-size"
            type="number"
            min={0}
            step="any"
            value={cellSize}
            onChange={(event) => setCellSize(event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="density-unit" className="text-sm text-muted-foreground">
            Cell unit
          </label>
          <select
            id="density-unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value as ShortDistanceUnit)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          >
            {SHORT_DISTANCE_UNITS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Lays a grid of this cell size over the layer&rsquo;s extent and reports how densely features fall across it.
        A smaller cell size gives a finer reading; one too small for the layer&rsquo;s extent is rejected rather
        than run.
      </p>

      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}

      <Button type="submit" disabled={runAnalysis.isPending}>
        {runAnalysis.isPending ? "Running…" : "Run Density Analysis"}
      </Button>
    </form>
  )
}

/** Dissolve (US5, FR-013) — merges features sharing one attribute value, so the key to group by is picked from the staged layer's own attribute keys. */
function DissolveForm({ projectId }: { projectId: string }) {
  const stagedInputLayerIds = useAnalysisStore((state) => state.stagedInputLayerIds)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const runAnalysis = useRunAnalysis(projectId)

  const [layerId] = stagedInputLayerIds
  const { data: layerFeatures } = useFeatures(layerId ?? "")
  const [attributeKey, setAttributeKey] = useState("")
  const [validationError, setValidationError] = useState<string | null>(null)

  const availableKeys = [
    ...new Set(layerFeatures?.features.flatMap((feature) => feature.attributes.map((a) => a.key)) ?? []),
  ].sort()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!layerId) {
      setValidationError("Select a layer first.")
      return
    }
    const key = attributeKey.trim()
    if (!key) {
      setValidationError("Choose the attribute to dissolve by.")
      return
    }
    setValidationError(null)

    runAnalysis.mutate(
      { operationType: "dissolve", inputLayerIds: [layerId], parameters: { attributeKey: key } },
      { onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to run Dissolve.") },
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Dissolve parameters" className="flex flex-col gap-3 p-3">
      <p className="text-sm text-muted-foreground">Layer: {layerId ?? "not staged"}</p>

      <div className="flex flex-col gap-1">
        <label htmlFor="dissolve-attribute" className="text-sm text-muted-foreground">
          Dissolve by attribute
        </label>
        {availableKeys.length > 0 ? (
          <select
            id="dissolve-attribute"
            value={attributeKey}
            onChange={(event) => setAttributeKey(event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          >
            <option value="">Select an attribute…</option>
            {availableKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        ) : (
          // The layer's features may not be loaded (or may carry no
          // attributes at all) — typing the key stays possible rather than
          // leaving an empty, unusable picker.
          <input
            id="dissolve-attribute"
            value={attributeKey}
            onChange={(event) => setAttributeKey(event.target.value)}
            placeholder="Attribute key"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          />
        )}
      </div>

      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}

      <Button type="submit" disabled={runAnalysis.isPending}>
        {runAnalysis.isPending ? "Running…" : "Run Dissolve"}
      </Button>
    </form>
  )
}

/** Merge (US5, FR-012) — concatenates every staged layer into one, so it takes all staged layers rather than a fixed pair. */
function MergeForm({ projectId }: { projectId: string }) {
  const stagedInputLayerIds = useAnalysisStore((state) => state.stagedInputLayerIds)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const runAnalysis = useRunAnalysis(projectId)
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (stagedInputLayerIds.length < 2) {
      setValidationError("Stage at least two layers to merge.")
      return
    }
    setValidationError(null)

    runAnalysis.mutate(
      { operationType: "merge", inputLayerIds: stagedInputLayerIds, parameters: undefined },
      { onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to run Merge.") },
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Merge parameters" className="flex flex-col gap-3 p-3">
      <p className="text-sm text-muted-foreground">
        Merging {stagedInputLayerIds.length} staged layer{stagedInputLayerIds.length === 1 ? "" : "s"}
        {stagedInputLayerIds.length > 0 ? `: ${stagedInputLayerIds.join(", ")}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        Every layer must hold the same geometry type. Features are copied unchanged, attributes included — use
        Dissolve to combine overlapping shapes instead.
      </p>

      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}

      <Button type="submit" disabled={runAnalysis.isPending}>
        {runAnalysis.isPending ? "Running…" : "Run Merge"}
      </Button>
    </form>
  )
}

/**
 * Split (US5, FR-012) — cuts the target layer with a "blade" layer. The
 * blade is a layer of line features, so the draw trigger switches the map
 * into line-draw mode (`editingStore.tool`, the same channel the Drawing
 * Toolbar uses); the drawn line lands in the currently selected layer,
 * which can then be staged as the split layer.
 */
function SplitForm({ projectId }: { projectId: string }) {
  const stagedInputLayerIds = useAnalysisStore((state) => state.stagedInputLayerIds)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const setTool = useEditingStore((state) => state.setTool)
  const runAnalysis = useRunAnalysis(projectId)
  const [validationError, setValidationError] = useState<string | null>(null)

  const [targetLayerId, splitterLayerId] = stagedInputLayerIds

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!targetLayerId || !splitterLayerId) {
      setValidationError("Stage two layers: the layer to split and the layer holding the split line.")
      return
    }
    setValidationError(null)

    runAnalysis.mutate(
      { operationType: "split", inputLayerIds: [targetLayerId, splitterLayerId], parameters: undefined },
      { onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to run Split.") },
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Split parameters" className="flex flex-col gap-3 p-3">
      <p className="text-sm text-muted-foreground">
        Layer to split: {targetLayerId ?? "not staged"} · Split line layer: {splitterLayerId ?? "not staged"}
      </p>

      <Button type="button" variant="outline" size="sm" onClick={() => setTool("draw-line")}>
        Draw a split line
      </Button>
      <p className="text-xs text-muted-foreground">
        Drawing adds the line to the layer selected in the Layers panel. Stage that layer second to cut with it.
      </p>

      {validationError && (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}

      <Button type="submit" disabled={runAnalysis.isPending}>
        {runAnalysis.isPending ? "Running…" : "Run Split"}
      </Button>
    </form>
  )
}
