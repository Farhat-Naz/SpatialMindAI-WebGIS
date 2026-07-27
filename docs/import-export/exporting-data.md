# Exporting Data — User Guide

How to get data out of the platform. Exports are produced **in your browser**
and downloaded directly — nothing is uploaded or staged on a server.

## What you can export

| Scope | What you get |
|---|---|
| **Current selection** | Only the features you have selected on the map |
| **This layer** | Every feature in the active layer |
| **Every layer in this project** | A ZIP with one GeoJSON file per layer plus a `manifest.json` recording layer names, feature counts, and the export time |

## Formats, and their structural limits

Each format has real limits — knowing them up front beats discovering them in
another tool:

- **GeoJSON** — the most faithful export: every geometry type, full attribute
  fidelity, standard WGS84. When in doubt, use this.
- **Shapefile (zipped)** — a complete `.shp`/`.shx`/`.dbf`/`.prj` set. The
  format stores **one geometry type per file**, so a mixed layer becomes one
  shapefile per type inside the archive — you are warned before the download,
  not after. DBF attribute names are limited to 10 characters by the format
  itself; longer names are truncated by convention.
- **KML** — opens in Google Earth. Attributes travel as `ExtendedData`;
  multi-part geometries are preserved as `MultiGeometry`. Always WGS84 (the
  format allows nothing else).
- **CSV** — one row per feature; attributes become columns and the geometry is
  a GeoJSON text column. Best for point data and spreadsheet workflows. Cells
  that look like formulas (`=`, `+`, `-`, `@`) are neutralized so a malicious
  attribute can't execute in Excel — the value is preserved, its executability
  is not.
- **PDF** — a print layout of the current map view (see below), not a data
  format.

An empty scope — an empty layer, or no selection — produces a clear message and
**no file**: an empty download that looks successful is worse than being told.

## Output coordinate system

By default exports are WGS84 (EPSG:4326), which every mainstream tool reads.
You can choose another system (e.g. a national grid) — coordinates are
transformed on the way out; the stored data is unaffected. The chosen system is
recorded in export history alongside format, scope, and feature count.

## Print / PDF

**Print / Export PDF** renders the current map view onto a real page:

- Page size (A4, A3, Letter) and orientation, with a live preview at the true
  aspect ratio
- Optional title, north arrow, ground-accurate scale bar, and layer legend —
  drawn as crisp vectors over the map raster
- Cancel closes the dialog without producing anything and leaves both the map
  and your page setup exactly as they were

If the map can't be captured directly (a browser cache quirk), the dialog opens
your browser's own print dialog instead — choose *"Save as PDF"* there.

## History

Every export attempt — successful **or failed** — is recorded with its format,
scope, output coordinate system, feature count, and outcome, in
**Import / export history** in the project sidebar. A failed export is the one
you most need a record of.
