"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/shared/components/ui/button"
import { usePresets, useSavePreset } from "../hooks/useAnalysisPresets"
import { useAnalysisStore } from "../store/analysisStore"

interface PresetPickerProps {
  projectId: string
  /**
   * Restricts the quick-start list to one operation's presets. Passed by
   * `OperationConfigForm`; omitted where every preset should be listed.
   */
  operationType?: string
  /** The parameters "Save as preset" captures — a completed run's, or the form's current draft. */
  parametersToSave?: unknown
}

/**
 * Preset save/apply (US8, FR-021) — names a parameter set so it can be
 * re-applied without reconstructing it.
 *
 * Applying a preset goes through `analysisStore.applyPreset`, which sets
 * both the operation type and the draft parameters together; setting the
 * operation type alone would clear the draft it was meant to fill.
 */
export function PresetPicker({ projectId, operationType, parametersToSave }: PresetPickerProps) {
  const { data } = usePresets(projectId, operationType)
  const savePreset = useSavePreset(projectId)
  const applyPreset = useAnalysisStore((state) => state.applyPreset)
  const selectedPresetId = useAnalysisStore((state) => state.selectedPresetId)
  const setLastError = useAnalysisStore((state) => state.setLastError)

  const [name, setName] = useState("")
  const [validationError, setValidationError] = useState<string | null>(null)

  const presets = data?.presets ?? []
  const canSave = operationType !== undefined && parametersToSave !== undefined

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = name.trim()
    if (!trimmed) {
      setValidationError("Name this preset before saving it.")
      return
    }
    if (!operationType) {
      setValidationError("Choose an operation before saving a preset.")
      return
    }
    setValidationError(null)

    savePreset.mutate(
      { name: trimmed, operationType: operationType as never, parameters: parametersToSave },
      {
        onSuccess: () => setName(""),
        onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to save the preset."),
      },
    )
  }

  return (
    <section aria-label="Presets" className="flex flex-col gap-3 p-3">
      <div>
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Saved presets</h3>
        {presets.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {operationType ? "No presets saved for this operation yet." : "No presets saved in this project yet."}
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {presets.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  onClick={() => applyPreset(preset)}
                  aria-pressed={selectedPresetId === preset.id}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent aria-pressed:bg-accent aria-pressed:font-medium"
                >
                  {preset.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">{preset.operationType}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canSave && (
        <form onSubmit={handleSave} aria-label="Save as preset" className="flex flex-col gap-2">
          <label htmlFor="preset-name" className="text-sm text-muted-foreground">
            Save current parameters as
          </label>
          <div className="flex gap-2">
            <input
              id="preset-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Preset name"
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            />
            <Button type="submit" size="sm" disabled={savePreset.isPending}>
              {savePreset.isPending ? "Saving…" : "Save as preset"}
            </Button>
          </div>

          {validationError && (
            <p role="alert" className="text-sm text-destructive">
              {validationError}
            </p>
          )}
        </form>
      )}
    </section>
  )
}
