"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/shared/components/ui/button"
import { useAnalysisStore } from "../store/analysisStore"
import { useRunAnalysis } from "../hooks/useAnalysis"
import type { MeasurementDistanceUnit } from "../services/spatialMath"

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
