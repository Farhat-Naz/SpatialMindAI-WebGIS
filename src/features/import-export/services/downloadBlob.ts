/**
 * Browser download helper (specs/005-import-export, T080).
 *
 * Centralizes the anchor-click + `URL.revokeObjectURL` pattern that was inline
 * in `useExportLayer` and 007's `useExportResult`.
 *
 * **`file-saver` is deliberately not adopted.** The codebase already downloads
 * blobs with the six lines below; adding a dependency to replace working code
 * spends Constitution Principle V's budget on nothing new, while the six
 * packages this feature *does* add each do work nothing in the codebase can
 * already do (research.md Decision 10). Recorded as a deliberate departure from
 * the original feature brief's technology list in plan.md's Complexity Tracking.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    // Appended to the document because Firefox ignores a click on a detached
    // anchor; removed immediately afterwards so nothing is left behind.
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    // Revoked in a `finally` so a throw between creation and click cannot leak
    // the object URL — and therefore the blob's memory — for the tab's lifetime.
    //
    // Deferred by a tick rather than revoked synchronously: some browsers
    // abandon an in-flight download if its source URL is revoked in the same
    // task as the click.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/**
 * Builds a filesystem-safe download name from a source name, a suffix, and an
 * extension — e.g. `Parcels 2026` → `Parcels_2026_export.geojson`.
 *
 * Characters outside `[\w.-]` collapse to `_`, and leading dots are stripped so
 * a layer named `.hidden` does not download as a dotfile.
 *
 * The fallback tests for a remaining **word character**, not merely a non-empty
 * string: a name of only separators (`"///"`, `"   "`) sanitizes to `"_"`, which
 * is non-empty but is not a usable filename, so it falls back to `export` too.
 */
export function toDownloadFilename(baseName: string, extension: string, suffix?: string): string {
  const sanitized = baseName.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "")
  const safe = /[a-zA-Z0-9]/.test(sanitized) ? sanitized : "export"
  return `${safe}${suffix ? `_${suffix}` : ""}.${extension}`
}
