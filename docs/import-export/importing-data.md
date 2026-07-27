# Importing Data — User Guide

How to bring existing GIS data into a project layer. Importing **adds**
features to the layer you choose — nothing already in it is changed or removed,
ever.

## Supported formats

| Format | What to select | Notes |
|---|---|---|
| **GeoJSON** | One `.geojson` / `.json` file | Must be a `FeatureCollection` at the top level. Coordinates are assumed WGS84 (the GeoJSON standard); a legacy `crs` member is honoured if present. |
| **Shapefile** | One `.zip` archive | Select the single ZIP — never the loose `.shp`/`.dbf` files. Nested folders inside the archive are fine. Needs at least the `.shp`; without a `.dbf` you get geometry but no attributes, and without a `.prj` you'll be asked for the coordinate system. If the archive holds several shapefiles, you choose which one to import. |
| **KML** | One `.kml` file | Placemark name, description, and folder path become attributes. Altitude is dropped (the platform stores 2D). Overlays, network links, 3D models, and GPS tracks are reported and skipped. |
| **KMZ** | One `.kmz` archive | Identical to KML — the archive is opened on your machine. |
| **CSV** | One `.csv` / `.tsv` / `.txt` | Point data only. You confirm which columns hold latitude and longitude; every other column can become an attribute. Comma, semicolon, tab, and pipe separators are handled, including European comma decimals (`51,5074`). |

Files are checked by **content**, not filename — a `.geojson` that actually
contains XML is refused with an explanation. The default size limit is 50 MB.

**Your file never leaves your machine as a file.** It is read and validated in
your browser; only the validated features are sent to the server.

## The import flow

1. **Choose a file.** It is parsed and fully validated immediately — nothing is
   written yet.
2. **CSV only: map your columns.** Pick the latitude and longitude columns
   (pre-guessed from your headers) and see a live preview of the resulting
   positions. The classic mistake — swapped lat/lng — is visible here before
   anything imports.
3. **Confirm the coordinate system.** If the file declares one (a Shapefile's
   `.prj`), it's shown with its source. Otherwise choose from the catalog, or
   paste a proj4/WKT definition for a custom grid. A preview shows where sample
   coordinates will land — **if the extent falls outside valid geographic
   bounds, the coordinate system is almost certainly wrong**, and the import
   won't proceed until you explicitly acknowledge it.
4. **Review the summary and confirm.** Exact counts: features read, will be
   imported, rejected, duplicates, repaired. Closing the dialog here costs
   nothing — no data has been written.
5. **Watch progress / cancel.** Large imports show a live count and can be
   cancelled; features imported before the cancel stay (and can be undone).
6. **Read the result.** The final counts always add up: imported + rejected +
   duplicates = features read. Nothing goes silently missing.

## Strict vs Lenient

- **Lenient (default):** valid features import; invalid ones are reported with
  their position in your file and the specific reason.
- **Strict:** if *any* feature is rejected, the whole import is automatically
  undone — all-or-nothing.

## Duplicates

A duplicate is a feature with identical geometry **and** identical attributes.
Duplicates — both within the file and against what's already in the layer —
are skipped by default and counted separately from rejections. At the
confirmation step you can tick **"Import the duplicates anyway"** to include
in-file copies.

## The validation report

The first 100 issues are shown inline with exact totals; the complete report is
downloadable as CSV during the session. History keeps the first 1,000 issues
per import (the counters stay exact regardless), and says so when a report was
larger. Positions are ones you can find: feature index for GeoJSON/Shapefile/
KML, the actual spreadsheet line number for CSV.

## Undo

Every import can be undone — from the summary, or later from
**Import / export history** in the project sidebar. Undo removes **exactly the
features that import added**. Anything else in the layer, including features
teammates added while your import was running, is untouched.
