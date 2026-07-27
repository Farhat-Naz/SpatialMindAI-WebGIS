import type { WidgetProps } from "../../types/widget.types"

/** A user-provided image (URL or upload reference) — US2/FR-005. */
export function ImageWidget({ widget }: WidgetProps) {
  const config = widget.config as { url?: string; alt?: string }
  if (!config.url) {
    return <p className="p-4 text-sm text-muted-foreground">No image configured.</p>
  }
  // eslint-disable-next-line @next/next/no-img-element -- a user-supplied, unpredictable external URL is not a build-time-optimizable Next.js Image source.
  return <img src={config.url} alt={config.alt ?? ""} className="h-full w-full object-contain" />
}
