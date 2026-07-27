import type { WidgetProps } from "../../types/widget.types"

/** Plain text content (US2/FR-005) — sanitized server-side at write time (T005/widgetRepository); rendered as plain text, never `dangerouslySetInnerHTML`, so no client-side sanitization is even needed for this type. */
export function TextWidget({ widget }: WidgetProps) {
  const config = widget.config as { content?: string }
  return <p className="whitespace-pre-wrap p-3 text-sm">{config.content ?? ""}</p>
}
