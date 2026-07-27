"use client"

import { useDashboardTemplates } from "../hooks/useDashboards"
import type { DashboardTemplateRecord } from "../types/dashboard.types"

interface TemplatePickerProps {
  selectedTemplateId: string | undefined
  onSelect: (templateId: string | undefined) => void
}

/**
 * Name/description/preview grid over the five built-in templates (US8),
 * mounted inside `CreateDashboardDialog`. "Importing" a template (T238)
 * means picking from this platform-wide catalog (`GET /api/dashboard-
 * templates`) — there is no file-upload path; "exporting" a dashboard as a
 * new template (T239) is out of scope per data-model.md (`DashboardTemplate`
 * rows are seeded, not user-creatable). Neither omission is silent — both
 * are recorded here and in plan.md's scope notes.
 */
export function TemplatePicker({ selectedTemplateId, onSelect }: TemplatePickerProps) {
  const { data, isLoading } = useDashboardTemplates()
  const templates = data?.templates ?? []

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading templates…
      </p>
    )
  }

  return (
    <div role="radiogroup" aria-label="Dashboard template" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          selected={selectedTemplateId === template.id}
          onSelect={() => onSelect(template.key === "blank" ? undefined : template.id)}
        />
      ))}
    </div>
  )
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: DashboardTemplateRecord
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex flex-col gap-1 rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
        selected ? "border-primary bg-accent" : "border-input"
      }`}
    >
      <span className="font-medium">{template.name}</span>
      {template.description && <span className="text-xs text-muted-foreground">{template.description}</span>}
    </button>
  )
}
