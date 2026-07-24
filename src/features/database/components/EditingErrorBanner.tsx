"use client"

import { AlertCircle, X } from "lucide-react"
import { Alert, AlertDescription } from "@/shared/components/ui/alert"
import { Button } from "@/shared/components/ui/button"
import { useEditingStore } from "@/features/database/store/editingStore"

/**
 * Shared error display for every editing operation (draw/edit/delete/
 * import) — a single centralized place so error-handling UI isn't
 * duplicated per component (spec FR: clear, actionable messages; never a
 * raw stack trace, since every error message routed here already came
 * through the existing typed `{ error: { code, message } }` mapping).
 */
export function EditingErrorBanner() {
  const lastError = useEditingStore((s) => s.lastError)
  const clearLastError = useEditingStore((s) => s.clearLastError)

  if (!lastError) return null

  return (
    <Alert variant="destructive" className="pointer-events-auto">
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
      <AlertDescription className="flex items-center justify-between gap-2">
        <span>{lastError}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          aria-label="Dismiss error"
          onClick={clearLastError}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </Button>
      </AlertDescription>
    </Alert>
  )
}
