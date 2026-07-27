# Quickstart: GIS Import & Export (005-import-export)

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-07-27

A runnable validation guide. Every scenario below maps to a user story and its success criteria,
and can be executed by hand once the feature is implemented. This is **not** an implementation
guide — no model bodies, no migrations, no test suites here.

---

## Prerequisites

```bash
# 1. Dependencies (six new packages — research.md Decision 10)
npm install

# 2. Ephemeral PostGIS test database (Docker required)
npm run test:db:up

# 3. Apply the additive migration
npx prisma migrate dev

# 4. Confirm PostGIS carries the EPSG catalog — ST_Transform depends on it
#    (research.md Decision 4). Expect a count in the thousands, never 0.
psql "$DATABASE_URL" -c 'SELECT count(*) FROM spatial_ref_sys;'

# 5. Run the app
npm run dev
```

**Environment**: `DEV_USER_ID` must match a seeded user (the interim auth seam,
`src/server/auth/getCurrentUser.ts`). `IMPORT_MAX_FILE_BYTES` is optional and defaults to 50 MB.

**Tear down** when finished: `npm run test:db:down`

### Test fixtures to prepare

Place under `src/features/import-export/__tests__/fixtures/`:

| Fixture | Contents | Exercises |
|---|---|---|
| `parcels.geojson` | 25 features, mixed Point/LineString/Polygon, string+numeric+null properties | US1 |
| `dirty.geojson` | 100 features: 1 longitude 200, 1 `GeometryCollection`, 1 self-intersecting polygon, 2 identical duplicates | US7 |
| `parcels_osgb.zip` | Shapefile set incl. `.prj` (EPSG:27700), inside a nested folder | US2, US8 |
| `parcels_latin1.zip` | Shapefile with a `.cpg` declaring a non-UTF-8 encoding, accented attribute values | US2 |
| `sites.kml` / `sites.kmz` | Placemarks, a path, a polygon, nested folders, 3D coordinates, one image overlay | US3 |
| `sites.csv` | Header row, `lat`/`lon` columns, 2 bad rows (empty, non-numeric), semicolon variant | US4 |
| `large.geojson` | 100,000 point features (generated, not committed) | US9, SC-002 |

---

## 1. Import GeoJSON (US1 — P1)

1. Open a project, select a layer that **already has features**, and note its feature count.
2. Open **Import** → choose `parcels.geojson`.
3. Confirm the preview reports **25 features, 0 rejected** and the source CRS defaults to WGS84.
4. Confirm.

**Expect**: progress advances to 100%; the map shows the original features **plus** 25 new ones;
the summary reads "25 imported, 0 rejected, 0 duplicates".

**Verify preservation** — pick an imported feature and open its attribute panel: string, numeric,
and boolean properties are present; **null properties are absent**, not stored as the text `"null"`
(FR-015).

**Verify rejection paths** — retry with a `.txt` renamed to `.geojson`, and with a valid JSON file
whose root is a bare `Feature`: both are refused at the dialog with a specific message, **before
any network request** (check the Network tab — it stays empty), and the layer count is unchanged.

**Covers**: FR-001–016 · SC-001, SC-006

---

## 2. Export data (US5 — P1)

1. On a layer with ~500 features, open **Export**, scope **Layer**, format **GeoJSON**. Download.
2. Repeat for **Shapefile**, **KML**, **CSV**.
3. Select 12 features on the map, scope **Selection**, format **GeoJSON**. Download.
4. Scope **Project**, format **GeoJSON**. Download.

**Expect**:
- GeoJSON is a valid `FeatureCollection` with 500 features, attributes under `properties`.
- The selection export contains **exactly 12** features.
- The project export is one archive: one file per layer, named after the layer, plus
  `manifest.json` listing layer names, feature counts, and the export timestamp.
- CSV has one row per feature, one column per distinct attribute key, a `geometry` column, and
  **empty cells** for absent attributes — never a shifted row.
- A mixed-geometry layer exported as Shapefile warns **before** download, then delivers one
  component set per geometry type.

**Verify externally (SC-008)**: open each file in QGIS. Geometry, attributes, and position must be
correct with no manual correction.

**Verify round trip (SC-007)**: re-import each exported vector file into a new empty layer. Feature
count, geometry, and attribute values match the original exactly.

**Verify formula safety (FR-040)**: give a feature an attribute value of `=1+1`, export CSV, open
in a spreadsheet — the cell shows the literal text, not `2`.

**Verify logging (FR-043)**: every export above appears in export history with format, scope,
feature count, and outcome.

**Covers**: FR-034–043 · SC-007, SC-008

---

## 3. Data validation (US7 — P2)

1. Import `dirty.geojson` in the default **Lenient** mode. Stop at the preview.
2. Read the validation report.

**Expect**: feature 7 reported as out-of-range longitude *by its position in the file*; the
`GeometryCollection` reported as an unsupported geometry type; the duplicate pair flagged with the
second one skipped and **counted separately from rejections**.

3. Confirm the import.

**Expect**: the self-intersecting polygon is rejected at commit time as invalid topology (a
PostGIS check, not a client one — research.md Decision 6); the summary's imported + rejected +
duplicate counts **sum exactly to the total read** (SC-006).

4. Repeat the same file in **Strict** mode.

**Expect**: nothing is imported, the layer count is unchanged, and the summary explains why. Watch
the Network tab: chunks post, then a `rollback` call fires — that is Strict mode's implementation
(research.md Decision 6), and the net result is all-or-nothing.

5. Import a file containing a feature identical to one already in the layer.

**Expect**: flagged as an existing-layer duplicate, skipped by default, with an option to import
it anyway.

6. Import a file with >100 defects.

**Expect**: the first 100 shown inline, an **accurate** total count, and a downloadable full
report.

**Covers**: FR-051–059 · SC-005, SC-006

---

## 4. Coordinate systems (US8 — P2)

1. Import `parcels_osgb.zip`.

**Expect**: the source CRS is **auto-detected from the `.prj`** and displayed; no manual selection
is required (FR-061).

2. Open the transformation preview.

**Expect**: sample transformed coordinates and the resulting bounding box, shown **before** any
data is written (FR-064).

3. Confirm and import, then compare a known parcel's position against a basemap.

**Expect**: within 1 metre of its true position (SC-009).

4. **Deliberately wrong CRS**: re-import the same file, overriding the source CRS to WGS84.

**Expect**: the preview's bounding box is implausible, a warning appears, and the import requires
explicit confirmation to proceed (FR-065, SC-010).

5. **Custom CRS**: supply a proj4 definition not in the catalog.

**Expect**: accepted if parseable; rejected with a clear message if not; never partially applied
(FR-063).

6. **Output CRS**: export a layer choosing EPSG:3857.

**Expect**: coordinates are transformed, and the Shapefile archive carries a matching `.prj`
(FR-041).

**Verify storage invariant (FR-012)**: whatever the source CRS, the stored geometry is EPSG:4326.

```bash
psql "$DATABASE_URL" -c 'SELECT DISTINCT ST_SRID(geometry) FROM "Feature";'   # → 4326, only
```

**Covers**: FR-060–066 · SC-009, SC-010

---

## 5. Import Shapefile (US2 — P2)

1. Import `parcels_osgb.zip` — a **single ZIP**, with the component set inside a nested folder.

**Expect**: components located automatically; no per-file selection; features imported with
attributes.

2. Import a ZIP with the `.dbf` removed.

**Expect**: rejected, naming the missing component (FR-018).

3. Import `parcels_latin1.zip`.

**Expect**: the `.cpg` encoding is honoured and accented characters are **not** mojibake (FR-020).

4. Import a ZIP containing two distinct shapefiles.

**Expect**: prompted to choose which to import, or to import each into its own layer (FR-021).

**Covers**: FR-017–021

---

## 6. Import CSV (US4 — P2)

1. Import `sites.csv`.

**Expect**: columns listed; `lat` / `lon` **pre-selected as a suggestion** that can be overridden
(FR-029).

2. Open the preview.

**Expect**: the first rows as a table alongside the coordinates they will produce (FR-031).

3. Confirm.

**Expect**: one point feature per row; non-coordinate columns become attributes; the two bad rows
are reported **by line number** (FR-033).

4. Repeat with the semicolon-delimited variant, and with a headerless file.

**Expect**: the delimiter is detected or selectable; headerless columns are addressable by
position (FR-028, FR-030).

**Covers**: FR-028–033

---

## 7. Import & export history (US10 — P2)

1. Perform one successful import, one failed import, and one export.
2. Open **History**.

**Expect**: all three present, newest first, each with acting user, timestamp, format, outcome, and
counts (FR-075, FR-076).

3. Open the failed entry.

**Expect**: the failure reason and a retrievable validation report (FR-078).

4. Page past the first page.

**Expect**: older entries load with no duplicates and no skips (FR-077).

5. Delete the layer an import targeted, then reopen its history entry.

**Expect**: the entry survives and states that its layer no longer exists (FR-079).

6. Sign in as a **Viewer** on the project.

**Expect**: history is readable; import, export, and rollback controls are unavailable (FR-080).

**Covers**: FR-075–080 · SC-012

---

## 8. Import KML / KMZ (US3 — P3)

1. Import `sites.kml`, then `sites.kmz` into separate layers.

**Expect**: identical results; placemarks, paths, and polygons become the corresponding geometry
types; `name`, `description`, and extended data survive as attributes; the folder path is present
as an attribute (FR-025).

2. Check a 3D placemark.

**Expect**: altitude dropped, 2D geometry stored, the drop reported (FR-026).

3. Check the image overlay.

**Expect**: reported as **skipped**, and the vector placemarks still import — the overlay does not
fail the run (FR-027).

**Covers**: FR-022–027

---

## 9. Bulk operations (US9 — P3)

Generate the fixture first:

```bash
node scripts/generate-large-geojson.mjs 100000 > /tmp/large.geojson
```

1. Import `large.geojson`. **While it runs**, pan and zoom the map continuously.

**Expect**: the map stays responsive throughout — parsing runs in a Web Worker
(research.md Decision 7), so the main thread is never blocked (SC-002).

2. Watch the progress readout.

**Expect**: both a percentage and a features-processed-of-total count, advancing at least once per
chunk and **at least once every 3 seconds** (FR-069, SC-003).

3. Around 40%, press **Cancel**.

**Expect**: chunk POSTs stop within ~2 seconds (SC-004); the summary states exactly how many
features were committed; those features **are on the map** — the confirmed keep-committed-chunks
design (spec Assumptions).

4. Press **Undo this import**.

**Expect**: the layer returns to its exact pre-import state; the history entry reads
`rolled_back`.

5. **Rollback isolation (SC-011)** — the case that matters most: repeat step 3, then in a **second
   browser window** draw a new feature into the same layer. Return to the first window and press
   Undo.

**Expect**: the import's features are gone; **the feature drawn in the second window survives**.
This is what `Feature.importJobId` provenance exists for (research.md Decision 14).

6. **Abandoned job (FR-074)** — start a large import and close the tab at ~50%. Wait 5 minutes,
   reopen history.

**Expect**: the entry reads `failed` ("interrupted before it finished"), **not** a permanently
"running" row, and Undo is still offered (research.md Decision 17).

**Covers**: FR-067–074 · SC-002, SC-003, SC-004, SC-011

---

## 10. Print & PDF export (US6 — P3)

1. On a map with two visible layers and one hidden layer, open **Print**.

**Expect**: a live preview of exactly the page area that will be produced (FR-044).

2. Select **A4 landscape**, enable title, north arrow, scale bar, and legend.

**Expect**: the preview reflows immediately; the legend lists the **two visible** layers and omits
the hidden one (FR-045, FR-048).

3. Download the PDF.

**Expect**: a single A4 landscape page; overlay elements at their previewed positions; the map at
print resolution rather than upscaled screen pixels (FR-049); text in the title, scale bar, and
legend is **selectable**, because those are drawn as vectors (research.md Decision 11).

4. Measure the scale bar against a known distance on the map.

**Expect**: accurate for the exported view's scale and zoom (FR-047).

5. Start a PDF export and cancel it.

**Expect**: no download; the map view is exactly as it was (FR-050).

**Tainted-canvas check (research.md Decision 11)**: if the PDF's map area is blank or a
`SecurityError` appears in the console, the tile layer is missing `crossOrigin="anonymous"`, or
tiles were cached before it was added. Hard-reload and retry; the dialog should have fallen back to
`window.print()` rather than failing outright.

**Covers**: FR-044–050 · SC-013

---

## Failure & recovery scenarios

| Scenario | How to reproduce | Expected |
|---|---|---|
| Oversized file | Select a file > 50 MB | Rejected at the dialog with the limit stated, **before** any read or upload (FR-081) |
| Zip slip | Craft a ZIP with an `../../evil.shp` entry | Rejected before any entry is read (FR-082) |
| Zip bomb | ZIP with >100:1 expansion ratio | Rejected against the expansion limit (FR-083) |
| Extension lie | `.geojson` containing XML | Rejected on **content** inspection, not extension (FR-004) |
| Network drop mid-import | DevTools → offline at ~50%, then online | Chunk retry resumes; **idempotency prevents double-insert** — verify the final count has no duplicates |
| Layer deleted mid-import | Delete the target layer while importing | Import terminates with a clear failure; no orphaned features |
| Access revoked mid-import | Remove the user's membership mid-run | Chunks rejected; job recorded as failed for authorization (FR-085) |
| Concurrent imports | Two users import into the same layer simultaneously | Both complete; each history entry attributes only its own features |
| Empty file | Import a 0-feature GeoJSON | "Nothing to import"; no job created |
| Empty export | Export a layer with 0 features | "Nothing to export"; no empty or corrupt file (FR-042) |
| Antimeridian | Import a geometry crossing ±180 | Imports without being mangled into a world-spanning shape |
| Coordinate extremes | Import at exactly ±180 / ±90 | **Accepted**, not rejected as out of range |

---

## Quality gates before merge

```bash
npx tsc --noEmit                 # zero errors            (Principle II, X)
npm run lint                     # zero warnings          (Principle X)
npm run test                     # all tiers green        (Principle VII)
npm run build                    # production build ok    (Principle X)
ANALYZE=true npm run build       # required: six new deps (Principle V)
```

Then confirm manually:

- Lighthouse **Accessibility ≥ 90** on every route the import/export UI mounts on (Principle X).
- All six security headers still present on the deployed response — **the CSP must be unchanged**;
  if a `worker-src blob:` entry appeared, the worker was built the wrong way
  (research.md Decision 7).
- The bundle analyzer shows **none** of the six new packages in the initial route bundle — every
  one is behind `await import()` (Principle V, research.md Decision 10).
