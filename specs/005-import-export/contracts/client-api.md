# Client API Contracts: GIS Import & Export (005-import-export)

**Feature**: [../spec.md](../spec.md) | **API**: [api-contracts.md](./api-contracts.md) | **Date**: 2026-07-27

The client side of `src/features/import-export/`. Layering follows Constitution Principle I
without exception:

```
components/   presentational only — markup + event handlers, no fetch, no logic
    ↓
hooks/        React Query + orchestration; the only place mutations are sequenced
    ↓
services/     the only code that calls fetch (via apiFetch) or runs a format writer
    ↓
store/        Zustand — UI/session state only, never a shadow cache of server state
```

**Cross-feature imports are deep, never through a barrel.** `@/features/database/index.ts`
re-exports `LayerTree`, `MapEditingLayer`, and `FeatureLayer`, which drag Leaflet and
leaflet-geoman into anything that touches it. `src/features/analysis/services/exportService.ts`
already documents this hazard and imports `featureService` from its own module for that reason;
this feature does the same.

---

## Services

### `services/apiFetch.ts`

Re-exports `@/features/database/services/apiFetch`. Not reimplemented — it already sets JSON
headers, unwraps the `{ error: { code, message } }` envelope, and handles `204`.

### `services/importService.ts`

Thin wrappers over the eight new endpoints. No business logic (Principle I).

```ts
export const importService = {
  create(layerId: string, input: CreateImportJobInput): Promise<{ importJob: ImportJobRecord }>
  commitChunk(jobId: string, input: CommitImportChunkInput): Promise<ImportChunkResult>
  complete(jobId: string, outcome: "succeeded" | "failed", errorMessage?: string): Promise<{ importJob: ImportJobRecord }>
  cancel(jobId: string): Promise<{ importJob: ImportJobRecord }>
  rollback(jobId: string): Promise<{ importJob: ImportJobRecord; deletedFeatureCount: number }>
  get(jobId: string): Promise<{ importJob: ImportJobRecord }>
  listIssues(jobId: string, params?: PagedParams): Promise<ImportIssuePage>
  listForProject(projectId: string, params?: PagedParams): Promise<{ imports: ImportJobRecord[]; nextCursor: string | null }>
}
```

Request/response types come from `@/shared/contracts/importJob.schema` and
`importChunk.schema` via `z.infer` — the same modules the Route Handlers import
(Constitution Principle II).

### `services/parsers/` — one module per format

Each exports the identical signature, so the pipeline is format-agnostic downstream:

```ts
export interface ParsedImport {
  features: NormalizedFeature[]      // geometry still in the SOURCE CRS
  detectedCrs: string | null         // from .prj / .cpg / KML default; null → user must choose
  columns?: string[]                 // CSV only
  warnings: ImportIssueDraft[]       // e.g. altitude dropped, unsupported KML content
}

export type ParseFile = (file: File, options: ParseOptions) => Promise<ParsedImport>
```

| Module | Library | Notes |
|---|---|---|
| `geoJsonParser.ts` | none | Root must be `FeatureCollection` (FR-014); non-scalar properties flattened to compact JSON (FR-016) |
| `shapefileParser.ts` | `shpjs` | Accepts the ZIP `ArrayBuffer` whole; resolves nested dirs, `.prj`, `.cpg` (FR-017–021) |
| `kmlParser.ts` | `@tmcw/togeojson` | `.kmz` unzipped with `jszip` first; folder path → attribute (FR-025); altitude dropped (FR-026) |
| `csvParser.ts` | `papaparse` | `header: true`, delimiter auto-detect with override (FR-028–030) |

All four are loaded with `await import()` inside the worker (research.md Decision 10), so a user
who never imports downloads none of them.

### `services/importPipeline.ts`

Orchestrates the worker. The one place the whole flow is expressed.

```ts
export async function runPreflight(file: File, options: PreflightOptions): Promise<PreflightResult>
export function chunkFeatures(features: NormalizedFeature[], size?: number): NormalizedFeature[][]
```

`PreflightResult` carries `totalFeatures`, the exact `rejected` / `duplicate` / `repaired` counts,
the full issue list (in memory, uncapped — the source of FR-058's in-session download), the
detected CRS, and the transformed bounding box for FR-064's preview.

**Worker construction — the CSP-critical line:**

```ts
new Worker(new URL("./importParser.worker.ts", import.meta.url), { type: "module" })
```

`next.config.ts` sets `script-src 'self' 'unsafe-inline'` with no `worker-src`. `worker-src` falls
back through `child-src` to `script-src`, and `blob:` is **not** listed — so
`new Worker(URL.createObjectURL(...))`, which several worker helper libraries use internally, is
**blocked at runtime in this application**. The `new URL(..., import.meta.url)` form emits a
same-origin chunk under `/_next/static/`, which `'self'` permits (research.md Decision 7). Do not
substitute a blob-URL worker library, and do not relax the CSP to accommodate one.

### `services/crsCatalog.ts`

```ts
export interface CrsEntry { code: string; name: string; proj4: string }
export const CRS_CATALOG: CrsEntry[]          // WGS84, Web Mercator + ~15 common national grids
export function findCrs(code: string): CrsEntry | undefined
export function parseCustomCrs(definition: string): CrsEntry | null   // proj4 or WKT; null = unparseable
export function previewTransform(sample: Position[], from: CrsEntry): { positions: Position[]; bbox: BBox }
export function isBboxPlausible(bbox: BBox): boolean                  // FR-065's wrong-CRS warning
```

Uses the already-installed `proj4` + `wkt-parser`. **Preview only** — the persisted transform is
`ST_Transform`, server-side (research.md Decision 4). A network lookup against `epsg.io` is not
possible here regardless: `connect-src 'self'` blocks it.

### `services/exportWriters.ts`

The format writers move here from `src/features/analysis/services/exportService.ts`, which then
**re-exports them so 007's Result Panel keeps compiling and behaving identically**
(research.md Decision 21).

```ts
export async function writeGeoJson(source: ExportSource, opts: ExportOptions): Promise<ExportResult>
export async function writeCsv(source: ExportSource, opts: ExportOptions): Promise<ExportResult>
export async function writeKml(source: ExportSource, opts: ExportOptions): Promise<ExportResult>
export async function writeShapefile(source: ExportSource, opts: ExportOptions): Promise<ExportResult>
export async function writeProjectArchive(projectId: string, opts: ExportOptions): Promise<ExportResult>
```

Carried over unchanged: page-streamed reads via `featureService.list`, the honest
`(pagesLoaded, pagesLoaded + 1)` progress heuristic, buffered CSV rows (a CSV header must list
every column before the first row is written, and the full key set is only known after the last
page), and `@mapbox/shp-write` for the shapefile.

Added by this feature:

- `ExportSource` — `{ kind: "layer", layerId }` | `{ kind: "selection", featureIds }` |
  `{ kind: "project", projectId }` (FR-035).
- `opts.outputCrs` — a proj4 transform applied per page as it streams (FR-041).
- **CSV formula neutralization** — a leading `=`, `+`, `-`, or `@` is prefixed with `'`. The value
  is preserved; its executability is not (FR-040). A genuine gap in the current writer.
- **Mixed-geometry Shapefile** — features partitioned by geometry type, one component set each,
  user warned before download (FR-038).
- `writeProjectArchive` — one file per layer plus `manifest.json` (layer names, feature counts,
  export timestamp), assembled with `jszip` (FR-037).

### `services/pdfExport.ts`

```ts
export interface PrintLayout {
  pageSize: "A4" | "A3" | "Letter"
  orientation: "portrait" | "landscape"
  title?: string
  showNorthArrow: boolean
  showScaleBar: boolean
  showLegend: boolean
}
export async function exportMapAsPdf(layout: PrintLayout, mapEl: HTMLElement): Promise<Blob>
export function canRasterize(): boolean     // false → fall back to window.print()
```

`html2canvas` rasterizes the map pane at 2× scale; `jsPDF` places it and draws title, north arrow,
scale bar, and legend as **vectors** on top, so their text stays crisp and selectable at print
resolution (FR-047, FR-049). Both dynamically imported.

**Tainted-canvas handling**: basemap tiles come from `tile.openstreetmap.org` and
`server.arcgisonline.com`. Both send `Access-Control-Allow-Origin: *`, but the browser only records
that if the image was requested with the CORS attribute — hence `crossOrigin="anonymous"` on the
`TileLayer` (the plan's only change to an already-implemented feature). If rasterization still
throws `SecurityError` — e.g. tiles cached before the attribute existed — `canRasterize()` returns
false and the dialog falls back to `window.print()` against a print stylesheet
(research.md Decision 11).

### `services/downloadBlob.ts`

```ts
export function downloadBlob(blob: Blob, filename: string): void
```

Centralizes the anchor-click + `revokeObjectURL` currently duplicated in
`useExportLayer`. `file-saver` is deliberately **not** adopted for this — a six-line utility
covers it, and Principle V's dependency budget is better spent on the six packages that do work
nothing in the codebase can already do (research.md Decision 10; recorded as a deviation from the
original brief's technology list in plan.md Complexity Tracking).

### `services/queryKeys.ts`

Centralized per Constitution Principle V — no hook builds a key inline.

```ts
export const queryKeys = {
  importJob:      (jobId: string) => ["imports", jobId] as const,
  importIssues:   (jobId: string, params?: unknown) => ["imports", jobId, "issues", params] as const,
  importHistory:  (projectId: string, params?: unknown) => ["projects", projectId, "imports", params] as const,
  /** Prefix for invalidation — one element shorter than importHistory(), so
   *  invalidateQueries matches every cached cursor page, not just the no-params
   *  one. Exactly the trap documented on database/services/queryKeys.ts's
   *  featuresList(). */
  importHistoryList: (projectId: string) => ["projects", projectId, "imports"] as const,
  exportHistoryList: (projectId: string) => ["projects", projectId, "exports"] as const,
}
```

---

## Hooks

### `useImport(layerId)` — the orchestrator

```ts
export function useImport(layerId: string): {
  preflight: (file: File, options: PreflightOptions) => Promise<void>
  confirm:   () => Promise<void>
  cancel:    () => void
  rollback:  (jobId: string) => Promise<void>
  reset:     () => void
}
```

Drives the full lifecycle and is the only place the sequence lives:

1. `preflight` → `runPreflight` in the worker → writes the result into `importStore` → the
   confirmation gate opens (FR-005). **No network call yet**, so abandoning here writes nothing
   (FR-011).
2. `confirm` → `importService.create` → then, per chunk, `commitChunk`, updating
   `importStore.progress` as each resolves (FR-009, FR-069).
3. **Strict mode**: the first chunk returning a non-empty `rejected[]` triggers an immediate
   `rollback`, making the observable outcome all-or-nothing (research.md Decision 6).
4. `cancel` → sets an `AbortController` so no further chunk is sent, then `importService.cancel`
   so the server refuses any that were already in flight (research.md Decision 13).
5. On settle → `invalidateQueries` on `queryKeys.importHistoryList(projectId)` **and** on
   `databaseQueryKeys.featuresList(layerId)` — imported features must appear on the map without a
   manual refresh.

### `useImportProgress(jobId, enabled)`

```ts
export function useImportProgress(jobId: string, enabled: boolean)
```

`useQuery` on `importService.get` with `refetchInterval: 2000`, **enabled only when this tab is
not the driver** — after a reload, or when viewing from another device. A tab running its own
import reads progress from the store, because it already holds the numerator and denominator
(research.md Decision 12).

### `useImportHistory(projectId, params)` / `useImportIssues(jobId, params)`

Plain cursor-paginated `useQuery`s, modeled directly on `useExportHistory`.

### `useExport(projectId)`

```ts
export function useExport(projectId: string): UseMutationResult<Blob, Error, ExportRequest>
```

Runs the client-side export, calls `downloadBlob`, then logs the outcome via
`POST /api/projects/:projectId/exports` on **both** success and failure — the try/catch/log shape
`useExportResult` already established, preserved so history never misses an attempt (FR-043).
Invalidates `queryKeys.exportHistoryList(projectId)` on settle.

### `usePrintExport()`

Owns `PrintLayout` state, the live preview, `exportMapAsPdf`, and the `window.print()` fallback.

---

## Stores (Zustand — UI/session state only)

### `store/importStore.ts`

```ts
interface ImportState {
  file: File | null
  sourceFormat: ImportSourceFormat | null
  step: "idle" | "parsing" | "mapping" | "crs" | "confirming" | "running" | "done"
  preflight: PreflightResult | null       // includes the FULL issue list (in-session)
  crs: { code: string; custom?: string; bboxPlausible: boolean }
  columnMapping: ColumnMapping | null
  mode: ImportMode
  progress: { processed: number; total: number } | null
  activeJobId: string | null
  summary: ImportSummary | null
}
```

Session state only. `ImportJobRecord`s from the server are **not** copied here — they stay in
React Query (Constitution: State Management, "server state MUST NOT be copied into a Zustand store
as a shadow cache"). `preflight` is the exception that proves the rule: it is a client-computed
artifact that was never server state, and holding it is what makes FR-058's uncapped in-session
issue download possible.

### `store/exportStore.ts`

```ts
interface ExportState {
  scope: "selection" | "layer" | "project"
  format: ExportFormat
  outputCrs: string
  printLayout: PrintLayout
  isDialogOpen: boolean
}
```

Selection membership is **read from Map Editing's existing selection store**, not duplicated here.

---

## Components (presentational)

| Component | Purpose | Key requirements |
|---|---|---|
| `ImportDialog` | Stepper shell: file → format → CRS → (CSV mapping) → preview → confirm | FR-005, FR-011 |
| `FileDropZone` | Keyboard-operable file input + drag/drop; size and type checks before read | FR-004, FR-081, FR-087 |
| `CrsSelector` | Catalog combobox, detected-CRS display, custom-definition field | FR-060–063, FR-091 |
| `CrsPreview` | Sample transformed coordinates + bbox; out-of-bounds warning | FR-064, FR-065 |
| `CsvColumnMapper` | Column table, lat/lng selectors, delimiter, header toggle | FR-029–031, FR-091 |
| `ImportPreviewTable` | First rows with resulting coordinates | FR-031 |
| `ValidationReport` | First 100 issues + exact totals + full download | FR-057, FR-058 |
| `ImportProgress` | `<progress>` with `aria-valuenow/valuemax`, polite live region, Cancel | FR-009, FR-070, FR-088, FR-089 |
| `ImportSummaryPanel` | Final counts + "Undo this import" | FR-010, FR-072 |
| `ImportHistoryPanel` | Paginated history; per-entry issue drill-in and rollback | FR-075, FR-077–079 |
| `ExportDialog` | Scope + format + output CRS; mixed-geometry Shapefile warning | FR-034, FR-035, FR-038, FR-041 |
| `PrintDialog` | Page size/orientation, element toggles, live page preview | FR-044–046, FR-050 |
| `PrintPreview` | Exact page-area preview | FR-044 |
| `ScaleBar` | Ground-distance-accurate bar, screen and PDF | FR-047 |
| `MapLegend` | Visible layers with symbology | FR-048 |

Reused as-is, not rebuilt: `NorthArrow` (`features/database/components/NorthArrow.tsx`, FR-046) and
the shadcn primitives already in `src/shared/components/ui/` — `Dialog`, `AlertDialog`, `Button`,
`Separator`, `Tooltip`, `DropdownMenu`, `ToggleGroup`.

**Replaced**: `features/database/components/ImportExportControls.tsx` becomes a thin launcher for
`ImportDialog` / `ExportDialog`. Its GeoJSON and loose-file Shapefile handlers, and
`services/shapefileImport.ts`, are removed — the spec sanctions this ("the existing Map Editing
import/export controls … replaced with the fuller interchange interface rather than duplicated").

---

## Accessibility contract

| Requirement | Implementation |
|---|---|
| FR-087 keyboard | Every control is a Radix primitive or a native element; visible focus rings; the hidden `<input type="file">` pattern already used in `ImportExportControls` is retained (button-labelled, keyboard-activated) |
| FR-088 announcements | `role="status"` `aria-live="polite"` for progress and completion; focus never moved |
| FR-089 progress semantics | Native `<progress>` with `aria-valuenow` / `aria-valuemax` plus a text alternative — never colour or width alone |
| FR-090 error association | `aria-describedby` from the offending control to its message; `role="alert"` when it blocks the next step |
| FR-091 CSV unaided | `CsvColumnMapper` and `CrsSelector` are labelled comboboxes with `aria-describedby` pointing at the preview; the entire CSV flow is completable by keyboard + screen reader (SC-014) |

---

## Client test matrix (Constitution Principle VII)

| Tier | Coverage |
|---|---|
| **Unit** | Each parser against a fixture per format; `crsCatalog` transform + `isBboxPlausible`; CSV formula neutralization; attribute sanitization; ring-closure repair; `chunkFeatures` boundaries |
| **Store** | `importStore` step transitions; `exportStore` scope/format; no server state shadowed |
| **Hook** | `useImport` happy path; **Strict-mode auto-rollback**; cancel aborts further chunks; `useImportProgress` polls only when not the driver; `useExport` logs on both success and failure |
| **Component** | Every conditional-render and ARIA-state component in the table above |
| **Integration** | Each of the five formats end-to-end against the real test database; export round-trip (SC-007); rollback isolation under a concurrent insert (SC-011) |
| **A11y** | axe assertions on `ImportDialog`, `ExportDialog`, `PrintDialog`; keyboard-only CSV walkthrough (SC-014) |
