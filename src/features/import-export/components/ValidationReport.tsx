"use client"

import { Button } from "@/shared/components/ui/button"
import type { ImportIssueDraft } from "@/shared/contracts/importIssue.schema"
import { IMPORT_INLINE_ISSUE_LIMIT } from "../types/importExport.constants"
import { downloadBlob } from "../services/downloadBlob"
import { importIssueCategoryLabels } from "../utils/importErrors"

/**
 * Validation issue report (specs/005-import-export, Phase 5 / Phase 16; FR-057,
 * FR-058).
 *
 * Three things, in order of how much they matter:
 *
 * 1. **Exact totals**, always — grouped by category, counted from the full set
 *    even when only a sample is displayed. A user needs to know that 4,000 rows
 *    were rejected, not that "many" were.
 * 2. The **first `IMPORT_INLINE_ISSUE_LIMIT`** issues inline, each with the
 *    position in the source file the user can actually navigate to (FR-033).
 * 3. A **download of the complete report**, which is the only way to act on
 *    100,000 issues.
 *
 * `truncated` is displayed rather than hidden: only the first
 * `IMPORT_MAX_PERSISTED_ISSUES` are stored per job, so a report read back from
 * history genuinely holds a prefix of a larger set, and saying so is the honest
 * option (research.md Decision 16).
 */

export interface ValidationReportProps {
  issues: ImportIssueDraft[]
  /** Exact totals, which stay correct even when `issues` is a capped sample. */
  counts?: { rejected: number; duplicate: number; repaired: number }
  /** True when the source of `issues` holds only the first N of a larger set. */
  truncated?: boolean
  /** Filename stem for the downloaded report. */
  fileName?: string
  /** Rows shown before the download affordance takes over. */
  inlineLimit?: number
}

/** Builds the downloadable report as CSV, which opens in whatever the user has. */
function toReportCsv(issues: ImportIssueDraft[]): string {
  const escape = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const lines = ["source_position,category,message"]
  for (const issue of issues) {
    lines.push(
      [String(issue.sourcePosition), issue.category, escape(issue.message)].join(","),
    )
  }
  return lines.join("\r\n")
}

export function ValidationReport({
  issues,
  counts,
  truncated = false,
  fileName = "import-issues",
  inlineLimit = IMPORT_INLINE_ISSUE_LIMIT,
}: ValidationReportProps) {
  if (issues.length === 0 && !counts) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        No validation issues were found.
      </p>
    )
  }

  // Grouped from whatever is in hand; the authoritative totals are `counts`.
  const byCategory = new Map<string, number>()
  for (const issue of issues) {
    byCategory.set(issue.category, (byCategory.get(issue.category) ?? 0) + 1)
  }

  const shown = issues.slice(0, inlineLimit)
  const hasMoreInline = issues.length > shown.length

  return (
    <div className="flex flex-col gap-3">
      {counts && (
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border px-3 py-2">
            <dt className="text-xs text-muted-foreground">Rejected</dt>
            <dd className="tabular-nums font-medium">{counts.rejected.toLocaleString()}</dd>
          </div>
          <div className="rounded-md border px-3 py-2">
            <dt className="text-xs text-muted-foreground">Duplicates</dt>
            <dd className="tabular-nums font-medium">{counts.duplicate.toLocaleString()}</dd>
          </div>
          <div className="rounded-md border px-3 py-2">
            <dt className="text-xs text-muted-foreground">Repaired</dt>
            <dd className="tabular-nums font-medium">{counts.repaired.toLocaleString()}</dd>
          </div>
        </dl>
      )}

      {byCategory.size > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {[...byCategory.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => (
              <li key={category} className="rounded-full bg-muted px-2 py-1">
                {importIssueCategoryLabels[category as keyof typeof importIssueCategoryLabels] ??
                  category}
                : <span className="tabular-nums font-medium">{count.toLocaleString()}</span>
              </li>
            ))}
        </ul>
      )}

      {shown.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-md border">
          <table className="w-full border-collapse text-xs" aria-label="Validation issues">
            <thead className="sticky top-0 bg-muted/90">
              <tr className="border-b text-left">
                <th scope="col" className="px-2 py-1 font-medium">
                  Position
                </th>
                <th scope="col" className="px-2 py-1 font-medium">
                  Issue
                </th>
                <th scope="col" className="px-2 py-1 font-medium">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((issue, index) => (
                <tr key={`${issue.sourcePosition}-${index}`} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-2 py-1 tabular-nums">{issue.sourcePosition}</td>
                  <td className="whitespace-nowrap px-2 py-1">
                    {importIssueCategoryLabels[issue.category] ?? issue.category}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {truncated ? (
            <>
              Showing the first {shown.length.toLocaleString()} issues. This import produced more than
              were stored, so the full list is no longer available for it.
            </>
          ) : hasMoreInline ? (
            <>
              Showing {shown.length.toLocaleString()} of {issues.length.toLocaleString()} issues.
            </>
          ) : (
            <>
              Showing all {shown.length.toLocaleString()} issue{shown.length === 1 ? "" : "s"}.
            </>
          )}
        </p>

        {issues.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadBlob(
                new Blob([toReportCsv(issues)], { type: "text/csv" }),
                `${fileName}.csv`,
              )
            }
          >
            Download full report ({issues.length.toLocaleString()})
          </Button>
        )}
      </div>
    </div>
  )
}
