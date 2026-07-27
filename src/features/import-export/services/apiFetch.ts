/**
 * Shared `fetch` wrapper for this feature's services.
 *
 * Re-exported from the database feature's implementation rather than
 * reimplemented — it already sets JSON headers, unwraps the
 * `{ error: { code, message } }` envelope on failure, and returns `undefined`
 * for a `204 No Content` response, which is the whole contract this feature
 * needs (Constitution: never duplicate code).
 *
 * Imported from its own module rather than through `@/features/database`'s
 * barrel: that barrel re-exports map components, which pull Leaflet and
 * leaflet-geoman into every consumer, and a plain data service must not drag a
 * map runtime along with it. `features/analysis/services/exportService.ts`
 * documents the same hazard for the same reason.
 */
export { apiFetch } from "@/features/database/services/apiFetch"
