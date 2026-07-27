import DOMPurify from "isomorphic-dompurify"

/**
 * Strips script execution vectors from Text/HTML widget content (FR-007)
 * while preserving ordinary formatting markup. Runs both server-side
 * (`widgetRepository.ts`, on create/update — the authoritative pass) and
 * client-side (Text/HTML widget render — defense in depth: re-sanitizes
 * even already-server-sanitized content in case of a future storage-layer
 * bypass). `isomorphic-dompurify` works identically in both environments —
 * no hand-rolled tag/attribute stripping, which is a well-known source of
 * XSS bypass bugs.
 */
export function sanitizeWidgetHtml(input: string): string {
  return DOMPurify.sanitize(input, { USE_PROFILES: { html: true } })
}
