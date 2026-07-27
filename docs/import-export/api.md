# Import / Export — API Surface

The HTTP surface behind `src/features/import-export/`. Authoritative request and
response shapes live in the Zod modules under `src/shared/contracts/` — this
document is the map, [specs/005-import-export/contracts/api-contracts.md](../../specs/005-import-export/contracts/api-contracts.md)
is the full contract.

## The two things newcomers get wrong

**There is no upload endpoint.** All five source formats (GeoJSON, zipped
Shapefile, KML, KMZ, CSV) are parsed **in the browser**. The server receives
normalized JSON chunks — never file bytes. There is no temp storage, no object
store, and no `Bytes` column anywhere in the schema. `ImportJob` keeps
`fileName` / `fileSizeBytes` / `mimeType` / `fileHash` as provenance metadata
only (research.md Decision 2).

**There is no export execution endpoint.** Exports run entirely client-side —
the writers in `services/exportWriters.ts` page features out of the existing
`GET /api/layers/:layerId/features` and assemble the file in the browser.
`POST /api/projects/:projectId/exports` **logs a finished attempt; it never
drives one** (007 research Decision 10). If you find yourself adding a
server-side export route, stop and re-read those two decisions.

## Endpoints

| # | Method | Path | Auth | Rate bucket |
|---|---|---|---|---|
| 1 | POST | `/api/layers/:layerId/imports` | Editor | `import:write` |
| 2 | POST | `/api/imports/:importJobId/chunks` | Editor | `import:write` |
| 3 | POST | `/api/imports/:importJobId/complete` | Editor | `import:write` |
| 4 | POST | `/api/imports/:importJobId/cancel` | Editor | `import:write` |
| 5 | POST | `/api/imports/:importJobId/rollback` | Editor | `import:write` |
| 6 | GET | `/api/imports/:importJobId` | Viewer | — (unthrottled) |
| 7 | GET | `/api/imports/:importJobId/issues` | Viewer | — |
| 8 | GET | `/api/projects/:projectId/imports` | Viewer | — |
| 9 | GET/POST | `/api/projects/:projectId/exports` | Viewer / Editor | `analysis:write` |

Endpoint 9 predates this feature (007); only its Zod schema was widened
(`format` gains `"pdf"`; `scope`, `outputCrs`, `layerCount` added). Its handler
is unchanged. Map Editing's `POST /api/layers/:layerId/features/import` and
`GET /api/layers/:layerId/features` are untouched.

## Semantics worth knowing

- **Chunks are idempotent on `(importJobId, chunkIndex)`.** A replay after a
  network blip returns the recorded result and commits nothing new. This is
  what makes the client's bounded retry safe.
- **The chunk endpoint is the security boundary.** Parsing is client-side, so
  the handler assumes a hostile caller: Zod re-validation, `geometrySchema`
  re-applied, ≤ 1,000 features and ≤ 8 MB per chunk, attribute sanitization
  re-run server-side, `assertProjectRole` before any logic.
- **Coordinates arrive untransformed**, in the job's `sourceCrs`. The persisted
  transform is PostGIS `ST_Transform`, inside the chunk-commit statement.
- **Cancel is a chunk-boundary check**, not a statement interrupt. After it
  returns, further chunk POSTs get `409 CONFLICT` — that refusal is the
  guarantee, and it lands well inside SC-004's 2-second budget.
- **Rollback deletes by provenance** (`Feature.importJobId = :id`), never by
  time window, so a concurrent user's features in the same layer survive.
- **Reads run the abandoned-job sweep**: a `running` job whose `heartbeatAt` is
  older than 5 minutes is returned as `failed` (no cron, no scheduler).

## Error mapping

No new `ApiErrorCode` was introduced. The nine existing codes cover everything:

| Situation | Code | HTTP |
|---|---|---|
| Malformed body, unknown/unavailable CRS, chunk over limits | `INVALID_INPUT` | 400 |
| No resolvable user | `UNAUTHORIZED` | 401 |
| Viewer attempting any write | `FORBIDDEN` | 403 |
| Unknown id, or caller has no project access (non-disclosure) | `NOT_FOUND` | 404 |
| Chunk after cancel; complete/chunks on a terminal job; second rollback | `CONFLICT` | 409 |
| `assertWriteRateLimit` exceeded | `RATE_LIMITED` | 429 |
| Anything unrecognized (generic message only) | `DATABASE_ERROR` | 500 |
