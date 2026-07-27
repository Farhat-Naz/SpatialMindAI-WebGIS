import { sanitizeWidgetHtml } from "@/shared/lib/sanitizeHtml"
import type { WidgetProps } from "../../types/widget.types"

/** Sanitized HTML content (US2/FR-007) — re-sanitized client-side at render as defense in depth, even though `widgetRepository` already sanitizes at create/update time. A `<script>` tag never executes. */
export function HtmlWidget({ widget }: WidgetProps) {
  const config = widget.config as { content?: string }
  const safeHtml = sanitizeWidgetHtml(config.content ?? "")
  return <div className="p-3 text-sm" dangerouslySetInnerHTML={{ __html: safeHtml }} />
}
