"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/shared/components/ui/button"
import { featureService, useDatabaseStore } from "@/features/database"
import { useAnalysisStore, type SpatialQueryPredicate } from "../store/analysisStore"
import { useRunAnalysis } from "../hooks/useAnalysis"
import type { MeasurementDistanceUnit } from "../services/spatialMath"
import type { AnalysisRunRecord } from "../types/analysis.types"

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
