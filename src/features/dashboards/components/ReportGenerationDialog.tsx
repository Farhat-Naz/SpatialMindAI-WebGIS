"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog"
import { Button } from "@/shared/components/ui/button"
import { useGenerateReport } from "../hooks/useReports"

const FORMATS = [
  { value: "pdf", label: "PDF" },
  { value: "excel", label: "Excel" },
  { value: "csv", label: "CSV" },
  { value: "html", label: "HTML" },
] as const

type ReportFormat = (typeof FORMATS)[number]["value"]

interface ReportGenerationDialogProps {
  projectId: string
  dashboardId: string
  /** The dashboard's rendered DOM element, captured for the PDF path (T196) — `DashboardView` supplies this via a ref. */
  dashboardElement: HTMLElement | null
}

/**
 * On-demand report generation (US5) — PDF captures `dashboardElement`
 * client-side (research.md Decision 9); Excel/CSV/HTML call `logReport`
 * with no `fileContent`, letting the server generate them. Every format
 * persists immediately on success (T197), so it appears in Generated
 * Reports without a page reload.
 */
export function ReportGenerationDialog({ projectId, dashboardId, dashboardElement }: ReportGenerationDialogProps) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ReportFormat>("pdf")
  const [error, setError] = useState<string | null>(null)
  const generateReport = useGenerateReport(dashboardId, projectId)

  async function handleGenerate() {
    setError(null)
    try {
      await generateReport.mutateAsync({ format, dashboardElement: dashboardElement ?? undefined })
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate the report.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">Generate report</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate report</DialogTitle>
          <DialogDescription>Choose a format — the file is added to Generated Reports below.</DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Format</legend>
          {FORMATS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="report-format"
                value={option.value}
                checked={format === option.value}
                onChange={() => setFormat(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleGenerate()} disabled={generateReport.isPending}>
            {generateReport.isPending ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
