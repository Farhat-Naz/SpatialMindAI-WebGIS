# Quickstart Validation Guide: Database Foundation

**Feature**: 003-database-foundation
**Date**: 2026-07-22

This guide validates that the database foundation (Prisma + PostGIS schema,
repositories, and Projects/Layers/Features Route Handlers) is correctly
implemented, once `/speckit-implement` has completed the tasks generated from
this plan. Run these checks in order.

---

## Prerequisites

- A PostgreSQL 16+ instance with the PostGIS extension available (locally via
  Docker, or a managed provider that supports installing PostGIS) — the
  extension is enabled by the first migration itself (Research Decision 4), it
  need not be pre-installed manually.
- `DATABASE_URL` set in `.env.local` pointing at that instance.
- `DEV_USER_ID` set in `.env.local` (Research Decision 6's interim auth seam) —
  the migrations/seed step below creates a matching seeded `User` row.
- Dependencies installed: `npm install` (including the new `@prisma/client`,
  `prisma`, and any raw-SQL helper additions for this phase).

---

## 1. Migrate and Seed

```bash
npx prisma migrate deploy
npx prisma db seed
```

Expected: migration applies cleanly (creates the `postgis` extension, all six
tables, all foreign keys, and the GiST index on `Feature.geometry`); the seed
step creates exactly one `User` row matching `DEV_USER_ID`.

```bash
npx prisma studio
```

Expected: `User`, `Project`, `Layer`, `Feature`, `FeatureAttribute`,
`FeatureStyle` tables are all visible and empty except for the seeded user.

---

## 2. Build & Quality Gates (Constitution Principle X)

```bash
npx tsc --noEmit
npm run lint
npm run test
```

Expected: zero TypeScript errors, zero ESLint warnings, all applicable test
tiers passing (unit, store, hook, API, integration — see `plan.md`'s Testing
Strategy), including the repository/API tests running against the real
PostGIS instance from Section 1 (Research Decision 11).

```bash
npm run build
```

Expected: production build completes with no errors.

---

## 3. Projects API (User Story 1)

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Downtown Survey","description":"2026 field survey"}'
```

Expected: `201`, `{ "project": { "id": "...", "name": "Downtown Survey", ... } }`.

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Downtown Survey"}'
```

Expected: `409`, `{ "error": { "code": "DUPLICATE_NAME", ... } }`.

```bash
curl http://localhost:3000/api/projects
```

Expected: `200`, `{ "projects": [ ... one entry ... ] }`.

```bash
curl -X PATCH http://localhost:3000/api/projects/<projectId> \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated description"}'
```

Expected: `200`; `updatedAt` has changed, `createdAt` has not.

```bash
curl -X DELETE http://localhost:3000/api/projects/<projectId>
```

Expected: `204`; a subsequent `GET` of the same project returns `404 NOT_FOUND`.

---

## 4. Layers API (User Story 2)

Create a fresh project first, then:

```bash
curl -X POST http://localhost:3000/api/projects/<projectId>/layers \
  -H "Content-Type: application/json" -d '{"name":"Roads"}'
curl -X POST http://localhost:3000/api/projects/<projectId>/layers \
  -H "Content-Type: application/json" -d '{"name":"Parcels"}'
```

Expected: both `201`; the second layer's `order` is greater than the first's.

```bash
curl -X PATCH http://localhost:3000/api/projects/<projectId>/layers/reorder \
  -H "Content-Type: application/json" \
  -d '{"orderedLayerIds":["<parcelsId>","<roadsId>"]}'
curl http://localhost:3000/api/projects/<projectId>/layers
```

Expected: the `GET` now returns Parcels before Roads, consistently across
repeated calls (SC-008).

```bash
curl -X DELETE http://localhost:3000/api/layers/<roadsId>
```

Expected: `204`; Parcels remains listed and unaffected.

---

## 5. Features API — Geometry, Attributes, Styles (User Story 3)

```bash
curl -X POST http://localhost:3000/api/layers/<parcelsId>/features \
  -H "Content-Type: application/json" \
  -d '{
    "geometry": {"type":"Polygon","coordinates":[[[-122.42,37.77],[-122.41,37.77],[-122.41,37.78],[-122.42,37.78],[-122.42,37.77]]]},
    "attributes": [{"key":"parcelNumber","value":"A-102"}],
    "style": {"color":"#2563eb","fillOpacity":0.4}
  }'
```

Expected: `201`, `{ "feature": { "id": "...", "geometry": {...}, "attributes": [...], "style": {...} } }`.

```bash
curl -X POST http://localhost:3000/api/layers/<parcelsId>/features \
  -H "Content-Type: application/json" \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,1],[1,0],[0,1],[0,0]]]}}'
```

Expected: `400`, `{ "error": { "code": "INVALID_INPUT", ... } }` — this ring
self-intersects and MUST fail PostGIS `ST_IsValid` (FR-015).

```bash
curl "http://localhost:3000/api/layers/<parcelsId>/features?limit=50"
```

Expected: `200`, `{ "features": [...], "nextCursor": ... }`.

```bash
curl -X PATCH http://localhost:3000/api/features/<featureId> \
  -H "Content-Type: application/json" \
  -d '{"attributes":[{"key":"parcelNumber","value":"A-102-REV"}]}'
```

Expected: `200`; the feature's `geometry` and `style` are unchanged, only
`attributes` differ (FR-021).

---

## 6. Authorization Boundary

Using a second, non-matching user context (swap `DEV_USER_ID` temporarily, or
call with a header the seam recognizes as a different user, per whatever
`getCurrentUser` implementation this phase ships):

```bash
curl -X DELETE http://localhost:3000/api/projects/<projectId-owned-by-other-user>
```

Expected: `401`, `{ "error": { "code": "UNAUTHORIZED", ... } }`; the project is
confirmed still present via a follow-up `GET` as the original owner.

---

## 7. Cascade Deletion

```bash
curl -X DELETE http://localhost:3000/api/projects/<projectId>
npx prisma studio
```

Expected: the `Feature`, `FeatureAttribute`, and `FeatureStyle` rows that
belonged to the deleted project's layers are gone — zero orphaned rows in any
table (SC-006).

---

## 8. Performance Spot-Check (SC-003)

Seed one layer with 100,000 generated point features (a one-off script, not
part of the shipped implementation), then:

```bash
time curl "http://localhost:3000/api/layers/<layerId>/features?limit=100"
```

Expected: response returns in under 2 seconds.

---

## Success Criteria Checklist

- [ ] Migration creates the PostGIS extension, all tables, all FKs, and the
      GiST index (Section 1)
- [ ] All quality gates pass: TypeScript, ESLint, tests, production build
      (Section 2)
- [ ] Project CRUD + duplicate-name rejection verified (Section 3)
- [ ] Layer CRUD + reorder consistency verified (Section 4)
- [ ] Feature CRUD, geometry validation (valid + rejected-invalid), attribute
      and style independence verified (Section 5)
- [ ] Cross-user access rejected as `401 UNAUTHORIZED` (Section 6)
- [ ] Cascade deletion leaves zero orphaned rows (Section 7)
- [ ] 100,000-feature layer listing returns in under 2 seconds (Section 8)
