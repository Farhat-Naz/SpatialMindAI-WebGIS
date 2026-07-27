# Feature Specification: GIS Import & Export

**Feature Branch**: `005-import-export`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Complete GIS Import & Export capabilities for SpatialMindAI-WebGIS. Adds GeoJSON / Shapefile (.zip) / KML / KMZ / CSV import, GeoJSON / Shapefile / KML / CSV / PDF export, print & PDF map output, data validation, coordinate-system handling, bulk operations, and import/export history. Existing Map Core, Search, Database Foundation, and Map Editing architecture is reused, not redesigned. Raster, DWG, DXF, LAS/LiDAR, and 3D models are out of scope."

---

## Overview

The platform today can import a GeoJSON `FeatureCollection` and a loose Shapefile file set
(`.shp` + `.dbf` + optional `.prj`) into a layer, and can download a layer as GeoJSON. Every
import is all-or-nothing, runs entirely in the foreground, reports only a total count, and is
not recorded anywhere the user can revisit.

This feature completes that capability into a full GIS interchange surface: five import formats,
five export formats, a real validation and reporting pipeline, explicit coordinate-system
handling, chunked and cancellable bulk operations for very large datasets, printable/PDF map
output, and a durable, auditable history of every import and export.

Imports are **additive**. No import path may delete, overwrite, or replace existing features as
an automatic consequence of importing. Removal is only ever an explicit, user-initiated action.

---

## User Scenarios & Testing *(mandatory)*

User story numbering (US1–US10) matches the feature brief so requirements stay traceable.
**Delivery order** follows priority, not numbering: `US1 → US5 → US7 → US8 → US2 → US4 → US10 → US3 → US9 → US6`.

### User Story 1 - Import GeoJSON (Priority: P1)

A GIS analyst has a `.geojson` file exported from another system. They select a target layer,
choose the file, see it validated and summarized before anything is written, watch a progress
indicator while it imports, and end with the file's features appended to the layer alongside
whatever was already there.

**Why this priority**: GeoJSON is the platform's native interchange format and the lowest-friction
path to demonstrable value. Every other import format converts into this same pipeline, so this
story establishes the validation, progress, summary, and append-only contract the rest reuse.

**Independent Test**: Import a `.geojson` file containing a mix of Point, LineString, and Polygon
features into a layer that already holds features. Verify all new features appear on the map, the
pre-existing features are untouched, the attributes survive, and the summary reports the correct
imported/rejected counts.

**Acceptance Scenarios**:

1. **Given** a layer containing 10 features, **When** the user imports a valid GeoJSON file with 25 features, **Then** the layer contains 35 features, the original 10 are unmodified, and the summary reports "25 imported, 0 rejected".
2. **Given** a GeoJSON file whose `properties` contain string, numeric, boolean, and null values, **When** it is imported, **Then** every non-null property is preserved as a retrievable attribute on its feature and null properties are omitted rather than stored as the text "null".
3. **Given** a file that is not valid JSON, **When** the user selects it, **Then** the import is rejected before any network call with a message naming the problem, and the target layer is unchanged.
4. **Given** a valid JSON file that is not a `FeatureCollection`, **When** the user selects it, **Then** the import is rejected with a message stating the expected structure.
5. **Given** an import of 5,000 features, **When** the import is running, **Then** a progress indicator reports advancing completion and the user is not left with an unresponsive interface.
6. **Given** a completed import, **When** the user views the summary, **Then** it shows total features read, imported, rejected, and skipped-as-duplicate counts.

---

### User Story 5 - Export Data (Priority: P1)

A user needs their data outside the platform. They choose what to export (the current selection,
an entire layer, or the whole project), choose a format, and receive a downloaded file that opens
correctly in standard desktop GIS software with geometry and attributes intact.

**Why this priority**: Export is the other half of the interchange contract and the primary
mitigation for data lock-in. It is independently valuable with zero import work done.

**Independent Test**: With a layer of mixed-geometry features selected, export to each of GeoJSON,
Shapefile, KML, and CSV; verify each downloaded file opens in standard GIS software with the same
feature count, geometry, and attribute values.

**Acceptance Scenarios**:

1. **Given** a layer with 500 features, **When** the user exports it as GeoJSON, **Then** the downloaded file is a valid `FeatureCollection` with 500 features and every feature's attributes present as `properties`.
2. **Given** 12 features selected on the map, **When** the user chooses "Export selection", **Then** the downloaded file contains exactly those 12 features and no others.
3. **Given** a project with 4 layers, **When** the user chooses "Export project", **Then** a single archive is downloaded containing one file per layer, each named after its layer, plus a manifest listing layer names, feature counts, and export timestamp.
4. **Given** a layer containing mixed geometry types, **When** the user exports as Shapefile, **Then** the archive contains one shapefile component set per geometry type, since the Shapefile format cannot hold mixed geometry in one file, and the user is told this before download.
5. **Given** a layer whose features carry attributes, **When** the user exports as CSV, **Then** each feature is one row, each distinct attribute key is a column, geometry is emitted in a documented textual column, and features missing an attribute have an empty cell rather than a shifted row.
6. **Given** an export of a layer with 0 features, **When** the user exports it, **Then** they receive a clear "nothing to export" message rather than an empty or corrupt file.
7. **Given** any completed export, **When** it finishes, **Then** an export history record is written capturing format, scope, feature count, outcome, user, and timestamp.

---

### User Story 7 - Data Validation (Priority: P2)

Before committing anything, a user wants to know exactly what is wrong with their file. They see
a validation report that separates valid features from invalid ones, names the specific defect
per rejected feature, flags duplicates, and lets them decide whether to import the valid subset
or abandon the file entirely.

**Why this priority**: Validation converts imports from a coin-flip into a reviewable decision.
It is what makes large real-world files (which are almost never perfectly clean) importable at all.

**Independent Test**: Import a file deliberately seeded with valid features, an out-of-range
coordinate, an unsupported geometry type, a self-intersecting polygon, and two byte-identical
duplicate features. Verify each defect is individually reported with its source row/index, and
that Strict and Lenient modes produce the two documented outcomes.

**Acceptance Scenarios**:

1. **Given** a file where feature 7 has a longitude of 200, **When** it is validated, **Then** the report identifies feature 7 by its position in the source file and states that the coordinate is out of range.
2. **Given** a file containing a `GeometryCollection`, **When** it is validated, **Then** that feature is reported as an unsupported geometry type and named as such.
3. **Given** a file containing a self-intersecting polygon, **When** it is imported, **Then** the feature is rejected as topologically invalid rather than stored, and the report says so.
4. **Given** **Lenient** mode (the default) and a file with 100 features of which 3 are invalid, **When** the user confirms the import, **Then** 97 features are imported and the summary reports 3 rejections with their reasons.
5. **Given** **Strict** mode and the same file, **When** the user confirms the import, **Then** nothing is imported, the layer is unchanged, and the summary reports why the file was rejected.
6. **Given** a file where two features have identical geometry and identical attributes, **When** it is validated, **Then** the second is flagged as an in-file duplicate and, by default, skipped and counted separately from rejections.
7. **Given** a file containing a feature identical to one already in the target layer, **When** it is validated, **Then** it is flagged as an existing-layer duplicate and skipped by default, with an option to import it anyway.
8. **Given** a validation report with more than 100 issues, **When** the user views it, **Then** the first 100 are listed inline with an accurate total count and a downloadable full report.

---

### User Story 8 - Coordinate Systems (Priority: P2)

A user's data is in a national or projected coordinate system, not WGS84. They select the source
coordinate system (or let the platform detect it), see a preview confirming the features land in
the right place on the map, and import with coordinates correctly transformed.

**Why this priority**: Silently importing projected coordinates as if they were degrees is the
single most damaging failure mode in GIS interchange — it produces plausible-looking data in the
wrong hemisphere. Correct CRS handling is a prerequisite for trusting Shapefile and CSV import.

**Independent Test**: Import the same dataset twice — once as WGS84 and once as Web Mercator with
the correct source CRS selected — and verify both land at the same real-world location.

**Acceptance Scenarios**:

1. **Given** a Shapefile archive containing a projection definition, **When** it is imported, **Then** the source coordinate system is detected automatically, shown to the user, and used for transformation without manual selection.
2. **Given** a file with no embedded projection information, **When** the user starts the import, **Then** they are asked to choose a source coordinate system, with WGS84 offered as the default.
3. **Given** a dataset in Web Mercator, **When** the user selects Web Mercator as the source, **Then** the imported features appear at their correct geographic position on the map.
4. **Given** a selected source coordinate system, **When** the user views the preview, **Then** a sample of transformed coordinates and the resulting bounding box are shown before any data is written.
5. **Given** a transformed bounding box that falls outside valid geographic bounds, **When** the preview renders, **Then** the user is warned that the chosen coordinate system is probably wrong and the import requires explicit confirmation to proceed.
6. **Given** a coordinate system not present in the built-in catalog, **When** the user supplies a custom definition, **Then** it is accepted if parseable, rejected with a clear message if not, and never partially applied.
7. **Given** any successful import, **When** the features are stored, **Then** they are stored in the platform's canonical coordinate system regardless of the source system.
8. **Given** an export, **When** the user selects an output coordinate system, **Then** the exported coordinates are transformed to it and the output carries the corresponding projection metadata where the format supports it.

---

### User Story 2 - Import Shapefile (Priority: P2)

A user has a Shapefile delivered the way Shapefiles are almost always delivered: as a single ZIP
archive. They upload the ZIP, the platform finds the component files inside it, reads geometry
and attributes, applies the archive's own projection, and imports.

**Why this priority**: Shapefile remains the dominant exchange format in professional GIS, and
ZIP is how it actually travels. The current loose-file-set upload is a workaround, not a workflow.

**Independent Test**: Upload a single `.zip` containing `.shp`, `.shx`, `.dbf`, and `.prj`, and
verify features import with attributes and correct positioning without the user selecting
individual component files.

**Acceptance Scenarios**:

1. **Given** a ZIP containing a complete Shapefile component set, **When** the user uploads it, **Then** the components are located inside the archive automatically and the import proceeds without further file selection.
2. **Given** a ZIP containing the component set inside a nested folder, **When** it is uploaded, **Then** the components are still located correctly.
3. **Given** a ZIP missing the attribute component, **When** it is uploaded, **Then** the import is rejected with a message naming the missing component.
4. **Given** a ZIP containing multiple distinct shapefiles, **When** it is uploaded, **Then** the user is asked which one to import, or may import each into its own layer.
5. **Given** a Shapefile whose attribute table uses a non-UTF-8 text encoding, **When** it is imported, **Then** the platform applies the archive's declared encoding if present and otherwise offers an encoding choice, so accented and non-Latin characters are not corrupted.
6. **Given** a Shapefile whose attribute names exceed the platform's limits or collide after truncation, **When** it is imported, **Then** names are de-duplicated deterministically and the mapping is shown in the summary.

---

### User Story 4 - Import CSV (Priority: P2)

A user has tabular data with latitude and longitude columns. They upload the CSV, tell the
platform which columns hold the coordinates, review a preview table of the first rows with the
resulting points, and import the rest as point features with the remaining columns as attributes.

**Why this priority**: CSV is the most common non-GIS source of spatial data and is what
non-specialist stakeholders produce. It broadens the platform's reach beyond GIS professionals.

**Independent Test**: Upload a CSV with headers, map the coordinate columns, confirm the preview,
import, and verify each row became a point feature with the non-coordinate columns as attributes.

**Acceptance Scenarios**:

1. **Given** a CSV with a header row, **When** it is uploaded, **Then** the column names are listed and the user selects which holds latitude and which holds longitude.
2. **Given** column names that clearly indicate coordinates, **When** the file is uploaded, **Then** those columns are pre-selected as a suggestion the user can override.
3. **Given** a chosen column mapping, **When** the user views the preview, **Then** the first rows are shown as a table alongside the coordinates that will be produced, before anything is imported.
4. **Given** a row whose coordinate cell is empty or non-numeric, **When** it is validated, **Then** that row is reported by its line number as invalid and handled per the selected import mode.
5. **Given** a row whose coordinates fall outside the valid range for the selected coordinate system, **When** it is validated, **Then** it is reported as out of range with its line number.
6. **Given** a CSV that uses semicolons as separators, **When** it is uploaded, **Then** the separator is detected or selectable, and the columns parse correctly.
7. **Given** a CSV with no header row, **When** the user indicates this, **Then** columns are addressable by position and the import still succeeds.

---

### User Story 10 - Import & Export History (Priority: P2)

A user or project administrator wants to know what data entered and left the project, when, and
by whom. They open a history view listing every import and export with its user, timestamp,
format, outcome, and statistics, and can inspect the full report for any past run.

**Why this priority**: Provenance is what makes a shared spatial dataset trustworthy and is a
common compliance requirement. It also underpins the rollback affordance in bulk operations.

**Independent Test**: Perform one successful import, one failed import, and one export; open the
history view and verify all three appear with correct user, timestamp, format, outcome, and counts.

**Acceptance Scenarios**:

1. **Given** any completed import, **When** the user opens history, **Then** the entry shows the acting user, timestamp, source format, source file name, target layer, outcome, and imported/rejected/duplicate counts.
2. **Given** any completed export, **When** the user opens history, **Then** the entry shows the acting user, timestamp, format, export scope, feature count, and outcome.
3. **Given** an import that failed, **When** the user opens its history entry, **Then** the failure reason is shown and the full validation report is retrievable.
4. **Given** a history list longer than one page, **When** the user scrolls or pages, **Then** older entries load newest-first without duplicating or skipping entries.
5. **Given** a user with view-only access to a project, **When** they open history, **Then** they can read it but cannot trigger an import or a rollback.
6. **Given** a history entry for a layer that was later deleted, **When** it is viewed, **Then** the entry survives and indicates that its target layer no longer exists.

---

### User Story 3 - Import KML / KMZ (Priority: P3)

A user has data from Google Earth or a field-collection tool as `.kml` or `.kmz`. They import it
and get their placemarks, paths, and polygons as features with their names, descriptions, and
extended data preserved as attributes.

**Why this priority**: KML/KMZ is a common field and consumer-tool format, but it reaches a
narrower professional audience than GeoJSON, Shapefile, and CSV.

**Independent Test**: Import a `.kml` and an equivalent `.kmz` containing placemarks, a path, and
a polygon, and verify both produce identical features with names and descriptions as attributes.

**Acceptance Scenarios**:

1. **Given** a `.kml` file with placemarks, paths, and polygons, **When** it is imported, **Then** each becomes a feature of the corresponding geometry type.
2. **Given** a `.kmz` archive, **When** it is imported, **Then** the enclosed document is extracted and produces the same result as the equivalent `.kml`.
3. **Given** placemarks with `name`, `description`, and extended data fields, **When** they are imported, **Then** those values are preserved as feature attributes.
4. **Given** a KML organized into nested folders, **When** it is imported, **Then** features import successfully and the folder path is preserved as an attribute.
5. **Given** a KML containing altitude in its coordinates, **When** it is imported, **Then** the altitude component is dropped and the resulting 2D geometry is stored without error.
6. **Given** a KMZ containing image overlays or 3D models, **When** it is imported, **Then** the supported vector placemarks import and the unsupported content is reported as skipped rather than failing the import.

---

### User Story 9 - Bulk Operations (Priority: P3)

A user imports a very large dataset. The platform processes it in chunks, reports meaningful
progress throughout, keeps the interface responsive, and lets the user cancel at any point and
see exactly how much landed — with a single action to undo the whole import if they want to.

**Why this priority**: This is a scale hardening of US1–US4 rather than new user-facing capability;
it matters enormously at enterprise volumes but delivers nothing that smaller imports don't already have.

**Independent Test**: Import a 100,000-feature file; verify progress advances, the interface stays
usable, cancellation stops further work promptly, and the summary accurately reports what was
committed and offers rollback.

**Acceptance Scenarios**:

1. **Given** a file of 100,000 features, **When** it is imported, **Then** it completes successfully and the interface remains responsive to scrolling and panning throughout.
2. **Given** a large import in progress, **When** the user watches it, **Then** progress reports both a percentage and a features-processed-of-total count that advance at least once per chunk.
3. **Given** a large import in progress, **When** the user cancels, **Then** no further chunks are committed, the operation stops promptly, and the summary states exactly how many features were committed before cancellation.
4. **Given** a cancelled or partially failed import, **When** the user views its summary, **Then** an "Undo this import" action is offered that removes exactly the features that import committed and nothing else.
5. **Given** an executed undo, **When** it completes, **Then** the layer holds exactly what it held before the import, the history entry is marked rolled back, and the undo itself is recorded.
6. **Given** a chunk that fails mid-import, **When** the failure occurs, **Then** previously committed chunks remain, the failure is reported with its cause, and the same rollback action is offered.
7. **Given** a browser tab closed during a large import, **When** the user returns, **Then** the history shows the import's actual terminal state rather than leaving it permanently "running".

---

### User Story 6 - Print & PDF Export (Priority: P3)

A user needs a shareable map document. They open a print/export dialog, choose page size and
orientation, position a title, north arrow, scale bar, and legend, preview the exact page, and
either print it or download it as a PDF.

**Why this priority**: Cartographic output is a distinct deliverable from data interchange, valuable
but not a prerequisite for any other story; it can ship last without blocking anything.

**Independent Test**: Open the print dialog on a map with two visible layers, select A4 landscape,
enable north arrow, scale bar, and legend, and verify the downloaded PDF matches the preview and
prints at the correct page size.

**Acceptance Scenarios**:

1. **Given** a map view, **When** the user opens the print dialog, **Then** a live preview shows exactly the page area that will be produced.
2. **Given** the print dialog, **When** the user selects a page size and orientation, **Then** the preview reflows to that page geometry immediately.
3. **Given** enabled map elements, **When** the PDF is produced, **Then** the north arrow, scale bar, legend, and title appear at their previewed positions.
4. **Given** a scale bar in the output, **When** it is measured against the map, **Then** it accurately represents distance at the exported view's scale and zoom.
5. **Given** multiple visible layers, **When** the legend is generated, **Then** it lists each visible layer with its symbology and omits hidden layers.
6. **Given** a generated PDF, **When** it is opened, **Then** it is a single page at the selected size with the map rendered at print-appropriate resolution rather than upscaled screen pixels.
7. **Given** a print job in progress, **When** the user cancels, **Then** no file is downloaded and the map view is left exactly as it was.

---

### Edge Cases

**File and format handling**

- A file with the correct extension but the wrong content (a `.geojson` that is actually XML) is rejected on content inspection, not on extension.
- An archive containing a path-traversal entry (`../../etc/passwd`) is rejected before any entry is read.
- An archive whose uncompressed size is disproportionate to its compressed size (a "zip bomb") is rejected against a declared expansion limit.
- An empty file, or an archive with no recognizable spatial content, produces a clear "nothing to import" message and no job.
- A file exceeding the maximum upload size is rejected client-side with the limit stated, before upload begins.
- A file with a byte-order mark, `CRLF` line endings, or trailing blank lines parses without spurious errors.

**Geometry and coordinates**

- A feature with `null` geometry is reported as invalid and never silently stored.
- A polygon whose ring is not closed is closed automatically where unambiguous, and reported as repaired in the summary.
- Coordinates at exactly ±180 longitude or ±90 latitude are accepted, not rejected as out of range.
- A geometry crossing the antimeridian imports without being silently mangled into a world-spanning shape.
- Coordinates supplied in the reverse order (latitude first when longitude was expected) trigger the out-of-bounds warning in the CRS preview rather than importing silently.

**Attributes**

- An attribute key that is empty, duplicated within one feature, or contains a control character is sanitized deterministically and the change is reported.
- An attribute value containing a leading `=`, `+`, `-`, or `@` is neutralized on CSV export so it cannot execute as a spreadsheet formula.
- An attribute value longer than the storage limit is truncated with the truncation reported, not silently discarded.
- Deeply nested or object-valued GeoJSON properties are flattened to a documented textual representation rather than dropped.

**Concurrency and state**

- The target layer is deleted while an import into it is running: the import terminates with a clear failure and no orphaned features.
- Two users import into the same layer simultaneously: both imports complete, and each history entry attributes only its own features.
- An import is undone after other users have added features to the same layer: only the import's own features are removed.
- A user's project access is revoked mid-import: the import stops and is recorded as failed for authorization.

**Export**

- An export of a selection whose features span multiple layers produces one coherent file, with the source layer recorded as an attribute.
- Export of a layer containing an attribute key that is invalid in the target format has that key transformed per the format's rules, with the mapping reported.
- A project export where one layer fails to serialize reports that layer as failed while still delivering the others.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Import — general behavior

- **FR-001**: System MUST accept imports in five source formats: GeoJSON, zipped Shapefile, KML, KMZ, and CSV.
- **FR-002**: System MUST require the user to select a target layer before an import can start.
- **FR-003**: System MUST append imported features to the selected layer. No import MUST ever delete, overwrite, replace, or truncate existing features as an automatic consequence of importing.
- **FR-004**: System MUST determine a file's format from its content, not solely its filename extension, and MUST reject a file whose content does not match any supported format.
- **FR-005**: System MUST validate an entire file and present a summary of what will happen before any feature is written, so the user confirms an import with full knowledge of its outcome.
- **FR-006**: System MUST support two import modes: **Strict**, in which any invalid feature causes the entire file to be rejected with nothing written; and **Lenient**, in which valid features are imported and invalid features are individually reported. **Lenient MUST be the default.**
- **FR-007**: System MUST preserve every feature's geometry through import without loss of vertices or degradation of precision beyond that inherent to the declared coordinate transformation.
- **FR-008**: System MUST preserve every feature's source attributes as retrievable feature attributes, and MUST report any attribute key that had to be transformed to be stored.
- **FR-009**: System MUST report import progress continuously while an import runs, expressing both a percentage and a features-processed-of-total count.
- **FR-010**: System MUST present an import summary on completion showing: total features read, imported, rejected, skipped as duplicate, and repaired, plus elapsed time.
- **FR-011**: System MUST allow the user to abandon an import at the validation-summary stage with nothing written.
- **FR-012**: System MUST store all imported geometry in the platform's canonical coordinate reference system, regardless of the source coordinate system.
- **FR-013**: System MUST support only the platform's established geometry types (Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon) and MUST reject any other geometry type with a message naming the unsupported type.

#### Import — GeoJSON (US1)

- **FR-014**: System MUST accept a GeoJSON `FeatureCollection` and reject other GeoJSON root types with a message stating the expected structure.
- **FR-015**: System MUST map each GeoJSON feature's `properties` object to feature attributes, omitting null and undefined values rather than storing them as text.
- **FR-016**: System MUST flatten nested or non-scalar property values to a documented textual representation rather than discarding them.

#### Import — Shapefile (US2)

- **FR-017**: System MUST accept a single ZIP archive containing a Shapefile component set and MUST locate the components within the archive, including inside nested directories, without the user selecting them individually.
- **FR-018**: System MUST reject a Shapefile archive missing a required component, naming the missing component.
- **FR-019**: System MUST read the archive's projection component when present and use it as the source coordinate system without requiring manual selection.
- **FR-020**: System MUST honor the archive's declared attribute-table text encoding when present, and MUST offer an encoding selection when it is absent, so non-ASCII attribute values are not corrupted.
- **FR-021**: When an archive contains more than one shapefile, System MUST let the user choose which to import, or import each into a separate layer.

#### Import — KML / KMZ (US3)

- **FR-022**: System MUST accept `.kml` documents and `.kmz` archives, extracting the enclosed document from the archive automatically.
- **FR-023**: System MUST convert KML placemarks, paths, and polygons into the corresponding platform geometry types.
- **FR-024**: System MUST preserve KML `name`, `description`, and extended-data fields as feature attributes.
- **FR-025**: System MUST preserve a feature's KML folder path as an attribute.
- **FR-026**: System MUST discard the altitude component of 3D KML coordinates and store the resulting 2D geometry, reporting that altitude was dropped.
- **FR-027**: System MUST import the supported vector content of a KML/KMZ containing unsupported content (overlays, 3D models, network links) and report the unsupported content as skipped rather than failing the whole import.

#### Import — CSV (US4)

- **FR-028**: System MUST parse delimited text files, detecting the delimiter and offering the user an override.
- **FR-029**: System MUST present the file's columns and require the user to designate the latitude and longitude columns, pre-selecting columns whose names indicate coordinates as an overridable suggestion.
- **FR-030**: System MUST support files with and without a header row, addressing columns by position when no header is present.
- **FR-031**: System MUST present a preview of the first rows with their resulting coordinates before any feature is written.
- **FR-032**: System MUST create one point feature per data row and map every non-coordinate column to a feature attribute.
- **FR-033**: System MUST report a row with a missing, non-numeric, or out-of-range coordinate as invalid, identified by its line number in the source file.

#### Export (US5)

- **FR-034**: System MUST export in five formats: GeoJSON, Shapefile, KML, CSV, and PDF.
- **FR-035**: System MUST support three export scopes: the current feature selection, an entire layer, and an entire project.
- **FR-036**: System MUST preserve geometry and all feature attributes in every exported vector format, subject to each format's documented structural limits.
- **FR-037**: System MUST deliver a project export as a single archive containing one file per layer plus a manifest listing layer names, feature counts, and the export timestamp.
- **FR-038**: When exporting mixed geometry types to Shapefile, System MUST produce one component set per geometry type and MUST inform the user of this before the download begins.
- **FR-039**: System MUST export CSV as one row per feature with each distinct attribute key as a column, geometry in a documented textual column, and empty cells for absent attributes.
- **FR-040**: System MUST neutralize attribute values on CSV export that would otherwise be interpreted as formulas by spreadsheet software.
- **FR-041**: System MUST let the user choose the output coordinate reference system for an export and MUST embed the corresponding projection metadata in formats that support it.
- **FR-042**: System MUST report a clear "nothing to export" outcome for an empty scope rather than producing an empty or malformed file.
- **FR-043**: System MUST record every export attempt — successful or failed — in export history.

#### Print & PDF Export (US6)

- **FR-044**: System MUST provide a print/export dialog with a live preview showing exactly the page area that will be produced.
- **FR-045**: System MUST offer standard page sizes (at minimum A4, A3, and US Letter) in both portrait and landscape orientation, with the preview reflowing immediately on change.
- **FR-046**: System MUST support optionally including a title, a north arrow, a scale bar, and a legend in the output, at positions shown in the preview.
- **FR-047**: System MUST render a scale bar that accurately represents ground distance at the exported view's scale and zoom.
- **FR-048**: System MUST generate a legend listing each visible layer with its symbology, excluding hidden layers.
- **FR-049**: System MUST render the map at print-appropriate resolution rather than upscaling the screen rendering.
- **FR-050**: System MUST allow the user to cancel a print or PDF generation, leaving the map view unchanged and producing no download.

#### Data Validation (US7)

- **FR-051**: System MUST validate every feature's geometry structure and coordinate ranges before submission, and its topological validity before storage.
- **FR-052**: System MUST reject a feature with null, empty, or structurally malformed geometry.
- **FR-053**: System MUST close an unclosed polygon ring where the correct closure is unambiguous, and MUST report the repair in the summary.
- **FR-054**: System MUST sanitize attribute keys and values — neutralizing control characters, resolving empty and duplicate keys deterministically, and truncating over-length values — and MUST report every transformation applied.
- **FR-055**: System MUST detect duplicate features both within the imported file and against the target layer's existing features, treating features with identical geometry and identical attributes as duplicates.
- **FR-056**: System MUST skip detected duplicates by default, count them separately from rejections, and offer the user an option to import them anyway.
- **FR-057**: System MUST report every rejected feature individually with its position in the source file and the specific reason for rejection.
- **FR-058**: System MUST display at least the first 100 validation issues inline with an accurate total count, and MUST make the complete issue report downloadable when it exceeds that.
- **FR-059**: System MUST retain each import's validation report for later retrieval from history.

#### Coordinate Systems (US8)

- **FR-060**: System MUST provide a catalog of selectable coordinate reference systems identified by their standard authority codes, including WGS84 and Web Mercator.
- **FR-061**: System MUST detect the source coordinate system from a file's embedded projection information when present and display the detected system to the user.
- **FR-062**: System MUST prompt the user to select a source coordinate system when none can be detected, offering WGS84 as the default.
- **FR-063**: System MUST accept a user-supplied custom coordinate system definition, accepting it if parseable, rejecting it with a clear message if not, and never applying it partially.
- **FR-064**: System MUST show a transformation preview — sample transformed coordinates and the resulting bounding box — before any data is written.
- **FR-065**: System MUST warn the user and require explicit confirmation when a transformed bounding box falls outside valid geographic bounds, since this indicates a probably-incorrect source coordinate system.
- **FR-066**: System MUST transform coordinates to the platform's canonical coordinate system on import and from it to the selected output system on export.

#### Bulk Operations (US9)

- **FR-067**: System MUST import files of at least 100,000 features without exhausting available memory or rendering the interface unresponsive.
- **FR-068**: System MUST process large imports in chunks, committing progressively rather than holding the entire dataset in a single operation.
- **FR-069**: System MUST update progress at least once per committed chunk.
- **FR-070**: System MUST allow the user to cancel an in-progress import, MUST stop committing further chunks promptly on cancellation, and MUST report exactly how many features were committed before the cancellation took effect.
- **FR-071**: System MUST retain chunks already committed when an import is cancelled or fails partway, and MUST record the import job so those features remain individually identifiable.
- **FR-072**: System MUST offer an "Undo this import" action on any cancelled, failed, or completed import that removes exactly the features that import committed and no others, including when other users have since added features to the same layer.
- **FR-073**: System MUST record an executed undo in history and mark the original import as rolled back.
- **FR-074**: System MUST resolve an import whose originating session ended (closed tab, lost connection) to a terminal state rather than leaving it permanently in progress.

#### Import & Export History (US10)

- **FR-075**: System MUST record every import attempt with: acting user, timestamp, source format, source file name, target layer, import mode, source coordinate system, outcome, and imported/rejected/duplicate/repaired counts.
- **FR-076**: System MUST record every export attempt with: acting user, timestamp, format, export scope, output coordinate system, feature count, and outcome.
- **FR-077**: System MUST present import and export history newest-first with paging that neither duplicates nor skips entries.
- **FR-078**: System MUST make a failed run's reason and full validation report retrievable from its history entry.
- **FR-079**: System MUST preserve a history entry after its target layer is deleted, indicating that the layer no longer exists.
- **FR-080**: System MUST scope history to a project and MUST enforce that users with view-only access can read history but cannot trigger imports, exports, or rollbacks.

#### Security

- **FR-081**: System MUST enforce a maximum upload size and MUST reject an oversized file before upload begins, stating the limit.
- **FR-082**: System MUST reject an archive containing entries with absolute paths or parent-directory traversal segments, before reading any entry.
- **FR-083**: System MUST enforce a maximum uncompressed-expansion ratio and total uncompressed size for archives, rejecting archives that exceed either.
- **FR-084**: System MUST validate and sanitize every attribute key and value before storage so imported content cannot inject executable or markup content into the interface.
- **FR-085**: System MUST verify the acting user's authorization on the target project and layer before an import commits anything, and MUST terminate an in-progress import whose authorization is revoked.
- **FR-086**: System MUST reject a malformed file with a message that describes the defect without exposing internal system details.

#### Accessibility

- **FR-087**: System MUST make every import, export, and print control reachable and operable by keyboard alone, with a visible focus indicator.
- **FR-088**: System MUST announce import and export progress and completion to assistive technology via a polite live region, without stealing focus.
- **FR-089**: System MUST expose progress indicators with their current value, maximum, and an accessible text alternative, so progress is not conveyed by visual position alone.
- **FR-090**: System MUST associate validation errors with the control or file they describe and announce them assertively when they block the user's next action.
- **FR-091**: System MUST make the column-mapping and coordinate-system selection controls operable and labelled such that a screen-reader user can complete a CSV import unaided.

### Key Entities

- **Import Job**: One user-initiated import of one file into one layer. Holds the acting user, target layer, source format, source file name and size, source coordinate system, import mode, lifecycle status (validating, awaiting confirmation, running, succeeded, failed, cancelled, rolled back), the imported/rejected/duplicate/repaired counts, start and completion times, and a failure reason when applicable. Survives deletion of its target layer.
- **Import Issue**: One validation problem found in one source feature or row, belonging to an Import Job. Holds the source position (feature index or line number), an issue category (invalid geometry, out-of-range coordinate, unsupported geometry type, invalid topology, missing coordinate, duplicate, sanitized attribute, repaired geometry), and a human-readable message.
- **Export Job**: One user-initiated export. Holds the acting user, format, scope (selection, layer, or project), the source layer or analysis run where applicable, output coordinate system, feature count, outcome, timestamp, and a failure reason when applicable. Extends the platform's existing export-history record.
- **Feature Import Provenance**: The association between an imported feature and the Import Job that created it — the mechanism that makes "Undo this import" able to remove exactly that import's features and nothing else.
- **Coordinate Reference System Entry**: A selectable coordinate system in the catalog — its authority code, display name, and definition. Includes built-in entries (WGS84, Web Mercator, and a curated common set) and user-supplied custom definitions.
- **Column Mapping**: The user's designation, for one CSV import, of which columns hold latitude and longitude, which delimiter applies, whether a header row is present, and which columns become attributes. Retained on the Import Job so a past import's interpretation is reproducible.
- **Print Layout**: The user's configuration for one print/PDF output — page size, orientation, title text, and which of north arrow, scale bar, and legend are included and where.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can import a 1,000-feature file in any of the five supported formats and see it on the map in under 30 seconds, including the validation and confirmation steps.
- **SC-002**: A 100,000-feature import completes successfully, and the interface remains interactive — panning and scrolling continue to respond — for the entire duration.
- **SC-003**: Progress feedback advances at least once every 3 seconds during any import that runs longer than 3 seconds, so no import ever appears frozen.
- **SC-004**: Cancelling an in-progress import stops further data being committed within 2 seconds of the user's action.
- **SC-005**: 100% of features rejected during an import are individually reported with their position in the source file and a specific, actionable reason.
- **SC-006**: Zero imports silently discard data: for every source feature, the summary accounts for it as imported, rejected, or skipped as duplicate, and the three counts always sum to the total read.
- **SC-007**: A dataset exported from the platform and re-imported produces identical geometry and attributes — a round trip loses nothing — for all four vector export formats.
- **SC-008**: A file exported in any vector format opens successfully in standard desktop GIS software with correct geometry, attributes, and positioning.
- **SC-009**: Data imported with a correctly specified source coordinate system lands within 1 metre of its true geographic position.
- **SC-010**: An import performed with a wrong source coordinate system is flagged to the user by the out-of-bounds warning before any data is written, in every case where the transformation produces coordinates outside valid geographic bounds.
- **SC-011**: "Undo this import" restores the target layer to its exact pre-import feature set in 100% of cases, including when other users added features to the same layer in the interim.
- **SC-012**: Every import and export attempt appears in history with complete, correct attribution — no run is unrecorded and no run is attributed to the wrong user.
- **SC-013**: A PDF export is produced within 15 seconds of confirmation and matches its on-screen preview in page size, orientation, and the position of title, north arrow, scale bar, and legend.
- **SC-014**: A user can complete an entire CSV import — upload, column mapping, coordinate-system selection, preview, and confirmation — using only a keyboard and a screen reader.
- **SC-015**: 100% of malformed, oversized, and maliciously-crafted archive uploads are rejected without partial import and without exposing internal system details.
- **SC-016**: All import and export interfaces meet the platform's established accessibility baseline, verified on every new or modified view.

---

## Assumptions

**Decisions confirmed with the requester**

- **Invalid features**: Imports offer a user-selectable **Strict** (reject whole file) and **Lenient** (skip invalid, import the rest) mode, with Lenient as the default. This satisfies both "reject invalid geometry" and "report failures" from the brief, and preserves the existing all-or-nothing import behavior as Strict mode so Map Editing's current contract is not broken.
- **Bulk cancellation**: A cancelled or partially failed large import keeps its already-committed chunks. Recovery is provided by an explicit "Undo this import" action scoped to that import job, rather than by holding a transaction open across 100,000+ features.

**Reasonable defaults applied where the brief was silent**

- **Canonical storage CRS**: All geometry is stored in the platform's established canonical system (WGS84 / EPSG:4326). This feature adds coordinate transformation at the import and export boundaries only; it does not introduce a second storage SRID.
- **Geometry types**: Limited to the platform's six established types. `GeometryCollection` and any other type is rejected, consistent with existing platform rules — this feature does not widen geometry support.
- **Duplicate definition**: Two features are duplicates when their geometry and their complete attribute set are both identical. Geometry-only or attribute-only matches are not treated as duplicates.
- **Upload size limit**: A single default maximum upload size applies to all formats, configurable per environment, with 50 MB assumed as the initial value.
- **Issue report cap**: 100 validation issues are shown inline; the complete report is downloadable beyond that.
- **CSV geometry**: CSV import produces point features only. Importing well-known-text geometry columns from CSV is not in this scope.
- **CSV export geometry**: Geometry is emitted in a single documented textual column rather than split into separate coordinate columns, so non-point geometry survives export.
- **Custom CRS**: Supplied as a standard projection definition string (as found in a Shapefile projection component). A visual CRS-builder interface is not in scope.
- **Print resolution and page sizes**: A4, A3, and US Letter in both orientations, at a print-appropriate raster density. Custom page dimensions and multi-page atlas output are not in scope.
- **History retention**: Import and export history is retained for the life of the project and is not automatically pruned.
- **Attribute storage**: Imported attributes use the platform's existing free-form key/value attribute model. This feature does not introduce per-layer fixed schemas.

**Dependencies on existing platform capabilities** *(reused, not redesigned)*

- The **Database Foundation** feature's layer, feature, and attribute model, its cursor-paginated feature listing, its geometry validation contract, and its bulk feature-import capability. Bulk import is extended to carry import-job provenance and to support Lenient mode; its existing all-or-nothing behavior becomes Strict mode.
- The **Map Editing** feature's layer selection, feature selection, and existing import/export controls, which this feature replaces with the fuller interchange interface rather than duplicating.
- The **Map Core** feature's map view, layer visibility, and symbology, required by the legend and print output.
- The existing **export-history record and its listing endpoint**, extended with the additional export scopes and the PDF format rather than replaced.
- The existing **coordinate reprojection capability** used by Shapefile import, extended into the general coordinate-system catalog and transformation preview.
- The platform's existing **authorization model** (project roles) and **rate limiting** on write operations, applied unchanged to every new import and export operation.

**Environment assumptions**

- Users import files from a local filesystem via a browser. Importing from a URL, a cloud storage connector, or a scheduled feed is not in scope.
- Source files are assumed to fit within the configured upload size limit; datasets beyond it are handled by splitting the source file, not by a streaming upload protocol.

---

## Out of Scope

The following are explicitly excluded from this feature:

- **Raster import** of any kind (GeoTIFF, imagery, elevation models, tiled raster sources).
- **CAD formats**: DWG and DXF.
- **Point cloud / LiDAR formats**: LAS, LAZ.
- **3D model formats** and any 3D geometry storage or rendering.
- **Live service connections**: WMS, WFS, WMTS, vector tile services, and any other network-served layer source.
- **Database-to-database transfer** and direct connections to external spatial databases.
- **Scheduled, automated, or webhook-triggered import and export.**
- **Style import and export** (SLD, QML, layer symbology definition files) — only geometry and attributes cross the boundary.
- **Multi-page or atlas PDF output**, and custom page dimensions beyond the standard sizes listed.
- **Attribute schema transformation** during import (field renaming rules, type coercion rules, calculated fields).
- **Merging or de-duplicating features across layers** as an import operation.
