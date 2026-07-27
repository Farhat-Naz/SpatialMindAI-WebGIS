/**
 * Shared `fetch` wrapper for this feature's services — re-exported from the
 * database feature's implementation rather than reimplemented (Constitution:
 * never duplicate code), same precedent `import-export`/`analysis` already
 * follow for the same reason.
 */
export { apiFetch } from "@/features/database/services/apiFetch"
