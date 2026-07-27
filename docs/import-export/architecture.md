# Import / Export — Architecture

How the interchange feature works, and the three constraints a future
contributor could unknowingly break. Companion to
[`src/features/import-export/README.md`](../../src/features/import-export/README.md)
(module-level detail) and [`api.md`](./api.md) (HTTP surface).

## The three load-bearing constraints

Break any of these and the feature fails in production while passing local
tests. They are asserted by tests and review, in that order of reliability:

1. **The parser worker must be same-origin, never `blob:`.**
   `next.config.ts` sets `script-src 'self' 'unsafe-inline'` with no
   `worker-src`; `worker-src` falls back through `child-src` to `script-src`,
   and `blob:` is not listed. `new Worker(URL.createObjectURL(...))` — which
   several worker-helper libraries use internally — therefore **works in dev
   and is blocked in production**. The only correct construction is
   `new Worker(new URL("./importParser.worker.ts", import.meta.url), {type: "module"})`,
   which emits a same-origin chunk under `/_next/static/`. Do not add a worker
   helper library, and treat a CSP diff in a PR touching this feature as a
   review failure.

2. **The persisted transform stays in PostGIS.** Every parser returns geometry
   in the source CRS; `ST_Transform` runs inside the chunk-commit statement
   (Constitution Principle IV). proj4 exists client-side only for the CRS
   *preview* and for *export* — both explicitly outside the mandate because
   neither is persisted platform state. Corollary: the custom-CRS path must use
   the three-argument `ST_Transform(geometry, from_proj, to_srid)` — the
   two-argument text form silently returns WKT input untransformed.

3. **`featureRepository.importFeatures` stays untouched.** Map Editing's
   per-feature import path is a compatibility contract. This feature's
   set-based `commitImportChunk` (4 statements per 1,000 features) is a
   separate, parallel path — the old one's tests must pass unmodified.

## Import pipeline

```
File ──(content-based format detection; size/zip-slip/zip-bomb guards)──▶
Web Worker (same-origin)
  ├─ await import() exactly one parser        (per-format, lazily loaded)
  ├─ parse → NormalizedFeature[]              (still in SOURCE CRS)
  └─ preflight: structure, ring repair, sanitization, in-file duplicates
        ▼
PreflightResult → importStore                 (uncapped issue list, in session)
  CRS selection + proj4 preview + bbox plausibility (transient, never persisted)
        ▼
CONFIRMATION GATE                             (abandoning here writes NOTHING)
        ▼
POST /imports → job (running)
  per 1,000 features: POST /chunks
    Zod re-validation → ST_Transform → WHERE ST_IsValid → duplicate probe
    → RETURNING id → counters + heartbeat + capped issues
        ▼
POST /complete → succeeded | failed           (strict mode: rollback instead)
```

The browser is the executor; the database is the system of record. There is no
queue, broker, scheduler, or long-running function — deliberately, for
deployment portability. The one thing a server-side worker would add (surviving
the tab's disappearance) is covered by `heartbeatAt` plus a lazy sweep on read.

## Export pipeline

```
ExportSource: selection | layer | project
  ▼ featureService.list — cursor-paged, one page at a time
  ▼ optional proj4 transform to outputCrs     (client-side; not persisted → OK)
  ▼ writer: GeoJSON | CSV | KML | Shapefile | project ZIP | PDF
  ▼ downloadBlob()
  ▼ POST /exports — logs the finished attempt (success AND failure)
```

CSV rows and Shapefiles are buffered (header needs whole-file knowledge);
GeoJSON and KML stream into Blob parts. CSV cells are formula-neutralized
(`=`, `+`, `-`, `@` prefixed with `'`). PDF is html2canvas raster + jsPDF
vector overlays, with a `window.print()` fallback when the canvas is tainted.

## Two-tier validation

| Tier | Where | What |
|---|---|---|
| Preflight (whole file, before the gate) | Worker | structure, coordinate range (CRS-aware), ring repair, attribute sanitization, in-file duplicates, CSV rows |
| Commit (per chunk) | PostGIS | `ST_IsValid` topology, in-layer duplicate probe (GiST `&&` narrowing → `ST_OrderingEquals`) |

Attribute sanitization runs in **both** tiers on purpose: the client pass tells
the user in advance, the server pass makes it true regardless of what the
client sent. A test asserts the two agree.

## The client-driven job model

`ImportJob` + `ImportIssue` are the entire persistence story. `ImportJob` rows
*are* the import history; `ExportJob` rows *are* the export history; file
metadata is columns; export statistics are columns. Progress is client-owned
(`importStore`) because the driving tab holds both numerator and denominator;
`GET /api/imports/:id` is polled only by a tab that is *not* the driver.
Rollback is exact because every imported feature carries `importJobId`.
