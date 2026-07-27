---

description: "Task list for feature implementation"
---

# Tasks: Dashboard, Reporting & Analytics

**Input**: Design documents from `specs/008-dashboard-analytics/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/, quickstart.md (all present and approved)

**Tests**: Explicitly requested (unit, API, hook, store, widget,
dashboard, integration, performance, accessibility tiers) — included
throughout.

**Organization**: This roadmap uses the 20-phase, layer-first structure
explicitly requested for this feature (Foundation → Database → Repository
→ Route Handlers → Client Services → Hooks → Stores → per-user-story
phases → UI → Performance → Accessibility → Testing → Docs), the same
shape 007-spatial-analysis's tasks.md already used. Phases 8–16 map to
spec.md's user stories, but — because the requested phase *names* group
by theme (e.g. "Widget Framework," "Analytics Widgets") rather than
1:1 by story — several phases carry more than one `[Story]` label across
their tasks, exactly as 007's Phase 16 already mixed `[US7]`/`[US10]`.
Every task's label reflects which spec.md user story it factually
belongs to, not just its phase's theme name.

**Architecture note (read before starting)**: Per the **approved**
research.md/data-model.md: `WidgetConfiguration` is **not** a separate
table — it is `DashboardWidget.config` (JSON). The new client module is
`src/features/dashboards/` (**plural**) — the existing
`src/features/dashboard/` (singular, app shell: `DashboardLayout`,
`Navbar`, `Sidebar`, `StatusBar`) is a different feature and is **not**
touched except for one new navigation link (research.md Decision 0).
Every spatial statistic a widget shows reuses 007-spatial-analysis's
`analysisOperations.ts` builders — this feature does not recompute them.
Every permission check reuses 006-collaboration's `assertProjectRole`,
layered with a new, narrow `DashboardShare` override (research.md
Decision 7). Tasks below implement each concept faithfully to what it
actually is per the approved documents.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency)
- **[Story]**: US1–US10 per spec.md, applied only to Phases 8–16;
  Phases 1–7/17–20 carry no story label
- Every task lists exact file paths and the fields required by this
  roadmap: Priority, User Story, Files, Goal, Acceptance Criteria
  (traceable to a spec.md FR-/SC- id), Verification, Dependencies

---

## Phase 1: Foundation

**Purpose**: Constants, shared types, widget interfaces, validation
schema shells, shared utilities, error vocabulary, query keys,
permissions helpers, and responsive-breakpoint helpers every later phase
depends on.

- [X] T001 Add dashboard/widget configuration constants
  - **Priority**: Must-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/dashboards/types/dashboardConfig.constants.ts` (new)
  - **Goal**: Define the live-refresh poll interval default (research.md Decision 6, SC-002's 30s bound), the responsive breakpoint pixel thresholds (desktop/tablet/mobile, matching `WidgetLayout.breakpoint`), the report-retention cap (research.md Decision 17), and the `AnalyticsSnapshot` TTL (research.md Decision 12) as named, typed constants.
  - **Acceptance Criteria**: Every later task needing one of these values imports from this file — no magic numbers.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T002 [P] Create shared dashboard/widget types
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/types/dashboard.types.ts` (new)
  - **Goal**: Re-exported TypeScript types for `Dashboard`, `DashboardWidget`, `WidgetLayout`, `DashboardTemplate`, `DashboardShare`, `DashboardFavorite`, `DashboardFilter`, `Report`, `ScheduledReport` per data-model.md — mirrors 007's `analysis.types.ts` re-export-only pattern.
  - **Acceptance Criteria**: Every field in data-model.md's ten entities has a corresponding TypeScript type (Constitution Principle II); zero `any`.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T003 [P] Define the shared widget interface / discriminated `WidgetType` union
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/types/widget.types.ts` (new)
  - **Goal**: One `WidgetType` union (`"map" | "statistics" | "table" | "chartBar" | "chartLine" | "chartArea" | "chartPie" | "gauge" | "metricCard" | "text" | "image" | "html"`, data-model.md) plus a `WidgetProps<T extends WidgetType>` generic interface every per-type widget component implements — the contract `WidgetRenderer` (Phase 9) dispatches against.
  - **Acceptance Criteria**: Adding a 13th widget type later requires touching only this union plus one new component, per research.md Decision 1's discriminated-type design.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T002

- [X] T004 Create Zod validation schema shells
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/dashboard.schema.ts` (new), `src/shared/contracts/widget.schema.ts` (new), `src/shared/contracts/dashboardFilter.schema.ts` (new), `src/shared/contracts/report.schema.ts` (new)
  - **Goal**: Shells only — `widget.schema.ts`'s per-`type` discriminated union and `dashboardFilter.schema.ts`'s per-`filterType` union get real field validation in Phases 8–14 as each type is implemented; this task establishes the file structure and the envelope fields (Constitution Principle II).
  - **Acceptance Criteria**: Each file exports one Zod schema + one `z.infer` type per its concern.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T005 [P] Add shared widget-content sanitization utility
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/lib/sanitizeHtml.ts` (new, or extend an existing shared lib file if one already exists — verified during implementation, not assumed)
  - **Goal**: One function, `sanitizeWidgetHtml(input: string): string`, used both server-side (`widgetRepository.ts`, on create/update) and client-side (Text/HTML widget render) for FR-007's defense-in-depth requirement.
  - **Acceptance Criteria**: A `<script>` tag or inline event handler (`onerror=`, etc.) is stripped; ordinary formatting markup is preserved.
  - **Verification**: `npx tsc --noEmit`; unit test in T014
  - **Dependencies**: None

- [X] T006 [P] Add responsive-breakpoint helper
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/breakpoint.ts` (new)
  - **Goal**: A small helper resolving the current viewport to `"desktop" | "tablet" | "mobile"` using T001's thresholds — consumed by `DashboardGrid` (Phase 9) to select which `WidgetLayout` breakpoint to render/save, and reusing the existing `useBreakpoint` hook pattern from the `dashboard` (singular, app-shell) feature's public barrel rather than reimplementing viewport-width detection.
  - **Acceptance Criteria**: FR-010 satisfied at the detection layer; reuses, does not duplicate, the app shell's existing breakpoint hook.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T001

- [X] T007 [P] Add `ForbiddenError`/`FORBIDDEN` confirmation (shared, no-op if already present)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/errors/apiError.ts` (verify/modify)
  - **Goal**: Confirm the `403 FORBIDDEN` code and `ForbiddenError` class (already added by 006/007) exist exactly once — this feature reuses it unchanged (research.md Decision 15).
  - **Acceptance Criteria**: No duplicate `ForbiddenError` class is introduced.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T008 [P] Add dashboard-specific error mapping notes
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/shared/errors/apiError.ts` (verify — no new code expected)
  - **Goal**: Confirm the existing `DUPLICATE_NAME`/`NOT_FOUND`/`INVALID_INPUT`/`RATE_LIMITED` codes cover every error case api-contracts.md documents for this feature — no dashboard-specific error code is introduced beyond the shared vocabulary.
  - **Acceptance Criteria**: api-contracts.md's error table maps 1:1 onto existing `ApiErrorCode` values.
  - **Verification**: Manual cross-reference, documented in the PR
  - **Dependencies**: T007

- [X] T009 Create `queryKeys.ts` factory shell
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/queryKeys.ts` (new)
  - **Goal**: Centralized query-key factories for every entity this feature queries — `dashboards`, `dashboard`, `widgetData`, `analyticsSnapshot`, `reports`, `scheduledReports`, `dashboardShares`, `dashboardFilters`, `dashboardTemplates` (contracts/client-api.md) — no consumer ever builds a key with an inline array literal (matching 004/007's established fix).
  - **Acceptance Criteria**: Every hook in Phase 6 imports its keys from this file.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T010 Add `resolveEffectivePermission` client-side type contract
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/types/dashboard.types.ts` (modify, from T002)
  - **Goal**: Export the `"owner" | "edit" | "view" | null` permission-level type the server's `resolveEffectivePermission` (repository-api.md) returns, embedded on every `Dashboard` API response so client-side UI can conditionally render write controls (server remains the enforcement authority regardless, per FR-026/SC-006).
  - **Acceptance Criteria**: `Dashboard` type includes an `effectivePermission` field.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T002

- [X] T011 Add server-side permissions helper shell
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/auth/assertProjectRole.ts` (reuse if 006 has landed; otherwise implement here first per 006's already-designed contract, as the shared prerequisite plan.md's Complexity Tracking flags — identical dependency 007 already carries)
  - **Goal**: Confirm the one shared authorization primitive every dashboard endpoint needs is available before Phase 3/4 build against it.
  - **Acceptance Criteria**: `assertProjectRole(projectId, userId, minimumRole)` is callable and typed.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T012 [P] Add `AnalyticsSnapshot` staleness-check helper
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/dashboardAnalyticsRepository.ts` (new — shell only; full aggregation logic lands in Phase 3)
  - **Goal**: `isSnapshotStale(computedAt: Date): boolean` using T001's TTL constant (research.md Decision 12) — the one small piece of the compute-if-stale-else-serve pattern worth isolating and unit-testing on its own.
  - **Acceptance Criteria**: Pure function, no DB access.
  - **Verification**: `npx tsc --noEmit`; unit test in T014
  - **Dependencies**: T001

- [X] T013 [P] Add shared capture/export utility shell
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/captureUtils.ts` (new — shell; full `html2canvas`/`jsPDF`/`xlsx` wiring lands with the new-dependency install in T024 and is used starting Phase 11)
  - **Goal**: Declare the shared interface (`captureElementAsPng(node)`, `buildPdfFromImages(images)`, `buildXlsxWorkbook(sheets)`) both `reportService.ts` (Phase 5/11) and `dashboardExportService.ts` (Phase 5/15) will call, per plan.md's Architecture → Export services section, so the two never duplicate capture logic.
  - **Acceptance Criteria**: Function signatures compile; implementations are `TODO`-free stubs replaced in later phases (not left as dead code past Phase 11/15).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T014 [P] Unit tests for Phase 1 utilities
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/lib/__tests__/sanitizeHtml.test.ts` (new), `src/server/repositories/__tests__/dashboardAnalyticsRepository.staleness.test.ts` (new), `src/features/dashboards/services/__tests__/breakpoint.test.ts` (new)
  - **Goal**: Unit-test T005's sanitization (script-tag/event-handler stripping), T012's staleness check, and T006's breakpoint resolution against known viewport widths.
  - **Acceptance Criteria**: All new tests pass, co-located under each module's `__tests__/` directory (Constitution Principle VII).
  - **Verification**: `npm run test -- sanitizeHtml dashboardAnalyticsRepository.staleness breakpoint`
  - **Dependencies**: T005, T006, T012

- [X] T015 Checkpoint (Phase 1)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm Foundation phase is complete and green before Phase 2 (Database) begins.
  - **Acceptance Criteria**: All of T001–T014 complete; no `TODO`/stub left in a non-shell file from this phase.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T001–T014

---

## Phase 2: Database

**Purpose**: Ten new Prisma models, the migration, indexes, relations,
and seed data, per data-model.md.

- [X] T016 Add `Dashboard` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify)
  - **Goal**: Add `Dashboard` exactly per data-model.md — `id`, `projectId`/`project`, `ownerId`/`owner`, `name`, `templateId`/`template` (set-null), `visibility`, `createdAt`/`updatedAt`, `@@unique([projectId, name])`, `@@index([projectId, updatedAt])`, `@@index([ownerId])`.
  - **Acceptance Criteria**: `prisma validate` passes; no existing model's fields change.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T002

- [X] T017 [P] Add `DashboardWidget` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `DashboardWidget` exactly per data-model.md, including the self-relation `groupId`/`onDelete: SetNull` for US3 grouping and the `config` `Json` column covering the "WidgetConfiguration" concept (research.md Decision 1 — no separate table).
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T018 [P] Add `WidgetLayout` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `WidgetLayout` exactly per data-model.md — `id`, `widgetId`/`widget`, `breakpoint`, `x`/`y`/`w`/`h`, `@@unique([widgetId, breakpoint])`.
  - **Acceptance Criteria**: `prisma validate` passes; one row per widget per breakpoint tier is enforceable via the unique constraint.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T017

- [X] T019 [P] Add `DashboardTemplate` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `DashboardTemplate` exactly per data-model.md — `id`, `key` (`@unique`), `name`, `description`, `widgetsBlueprint` (Json), `createdAt`/`updatedAt`.
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T020 [P] Add `DashboardShare` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `DashboardShare` exactly per data-model.md, including the two distinct `User` relations (`userId` recipient, `grantedByUserId` granter) requiring named relations in Prisma (`@relation("DashboardShareRecipient")` / `@relation("DashboardShareGranter")`).
  - **Acceptance Criteria**: `prisma validate` passes; `@@unique([dashboardId, userId])` present.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T021 [P] Add `DashboardFavorite` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `DashboardFavorite` exactly per data-model.md — `@@unique([dashboardId, userId])`, `@@index([userId])`.
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T022 [P] Add `DashboardFilter` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `DashboardFilter` exactly per data-model.md — `widgetId` nullable (global vs widget-scoped), `filterType`, `config` (Json — spatial filter geometry stored as GeoJSON here, not a PostGIS column, per data-model.md's Migration notes).
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T017

- [X] T023 [P] Add `Report` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `Report` exactly per data-model.md, including the `fileContent Bytes?` column (research.md Decision 17 — the one server-stored file in this feature) and `scheduledReportId`/`onDelete: SetNull`.
  - **Acceptance Criteria**: `prisma validate` passes; `Bytes` type accepted by the Prisma schema.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T024 Add the four new npm dependencies
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `package.json`, `package-lock.json` (modify)
  - **Goal**: Install `react-grid-layout`, `recharts`, `jspdf`, `html2canvas`, `xlsx` (research.md Decisions 2, 3, 9; plan.md Complexity Tracking).
  - **Acceptance Criteria**: All five packages install cleanly; `npm run build` still succeeds.
  - **Verification**: `npm install && npm run build`
  - **Dependencies**: None

- [X] T025 [P] Add `ScheduledReport` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `ScheduledReport` exactly per data-model.md — `format` restricted at the Zod layer (not the DB layer) to exclude `"pdf"` (research.md Decision 10), `nextRunAt`, `isActive`, `@@index([nextRunAt, isActive])`.
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T023

- [X] T026 [P] Add `AnalyticsSnapshot` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `AnalyticsSnapshot` exactly per data-model.md — `@@unique([projectId, snapshotType, scopeId])` (upsert target, not append-only, unlike `Activity`).
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T027 Add indexes audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (verify, same file as T016)
  - **Goal**: Cross-check every index data-model.md specifies is present across all ten new models (the individual model tasks above already add them — this task is the completeness audit before migrating).
  - **Acceptance Criteria**: 1:1 match against data-model.md's per-entity "Indexes" sections.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T016–T023, T025, T026

- [X] T028 Add back-relations to `Project` and `User`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `dashboards`, `analyticsSnapshots` to `Project`; `dashboards` (`@relation("DashboardOwner")`), `dashboardShares`/`dashboardSharesGranted` (both named relations), `dashboardFavorites`, `reports`, `scheduledReports` to `User`, exactly per data-model.md's back-relations block.
  - **Acceptance Criteria**: `prisma validate` passes; no existing field on either model is altered.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016, T020, T021, T023, T025, T026

- [X] T029 Generate and apply the migration
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_dashboard_analytics/migration.sql` (generated)
  - **Goal**: Run `prisma migrate dev` to produce one migration creating all ten new tables plus back-relations, per data-model.md's Migration notes.
  - **Acceptance Criteria**: Migration applies cleanly against the test database; zero change to any existing table.
  - **Verification**: `npx prisma migrate status`
  - **Dependencies**: T027, T028

- [X] T030 [P] Update `prisma/seed.ts` — five built-in `DashboardTemplate` rows
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/seed.ts` (modify)
  - **Goal**: Idempotently upsert the Blank/Executive/Operations/Asset/Environmental templates (keyed by `key`), each with a `widgetsBlueprint` matching spec.md US8's Acceptance Scenarios 2–5 (US8/FR-028).
  - **Acceptance Criteria**: Re-running the seed script does not duplicate template rows.
  - **Verification**: Run the project's seed command against the test database
  - **Dependencies**: T029

- [X] T031 [P] Update `prisma/seed.ts` — sample dashboard/widget/report fixtures
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `prisma/seed.ts` (modify, same file as T030)
  - **Goal**: Seed one sample dashboard with 2–3 widgets, one `Report`, and one `ScheduledReport` for the seeded project, so quickstart.md's walkthrough has realistic starting data.
  - **Acceptance Criteria**: Seed command completes with no errors.
  - **Verification**: Run the project's seed command against the test database
  - **Dependencies**: T030

- [X] T032 Checkpoint (Phase 2)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the schema/migration/seed/dependency layer is complete and green before Phase 3 (Repository Layer) begins.
  - **Acceptance Criteria**: All of T016–T031 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T016–T031

---

## Phase 3: Repository Layer

**Purpose**: Six new repository files per contracts/repository-api.md,
each owning one primary table-group. "TemplateRepository"/
"FavoriteRepository" from the roadmap outline are folded into
`dashboardRepository.ts` (data-model.md — `DashboardTemplate` reads are a
simple list, `DashboardFavorite` is owned alongside `Dashboard` itself,
per repository-api.md's actual file grouping) — see per-task notes.

- [X] T033 Create `dashboardRepository.ts` — list/get
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/dashboardRepository.ts` (new)
  - **Goal**: Implement `listDashboardsForProject`, `getDashboardById` exactly per contracts/repository-api.md — union-scoped via `assertProjectRole` **plus** any `DashboardShare` (research.md Decision 7), computing `isFavorite`/`sharedWithMe` per row.
  - **Acceptance Criteria**: A user with a `DashboardShare` but insufficient base project role still sees that one dashboard in their list.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T011, T016, T029

- [X] T034 [P] `dashboardRepository.ts` — create/rename/visibility/delete
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/dashboardRepository.ts` (modify, same file as T033)
  - **Goal**: Implement `createDashboard` (template-blueprint instantiation inside one transaction, US8/FR-029), `renameDashboard`, `setDashboardVisibility` (owner/project-Owner only, FR-024), `deleteDashboard` (writes one `Activity` row, research.md Decision 11).
  - **Acceptance Criteria**: `createDashboard` with a `templateId` produces the template's full widget/layout blueprint in one atomic operation.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T033

- [X] T035 [P] `dashboardRepository.ts` — duplicate + favorite (covers "TemplateRepository" read, "FavoriteRepository")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/dashboardRepository.ts` (modify, same file as T033), `src/server/repositories/dashboardTemplateRepository.ts` (new, small — `listTemplates` only, per repository-api.md's note that templates have no dedicated large repository)
  - **Goal**: Implement `duplicateDashboard` (deep-copy, zero shared rows, FR-002), `setFavorite`/`unsetFavorite` (idempotent upsert/delete), `listTemplates`.
  - **Acceptance Criteria**: Duplicating a dashboard with 10 widgets produces 10 new, independent `DashboardWidget`/`WidgetLayout` rows.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T019, T033

- [X] T036 Create `widgetRepository.ts` — widget CRUD
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/widgetRepository.ts` (new)
  - **Goal**: Implement `addWidget` (validates `config` per-`type`, sanitizes HTML/Text via T005, FR-005/FR-006/FR-007), `updateWidget`, `deleteWidget` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: `addWidget` assigns a default per-breakpoint `WidgetLayout` when none is supplied.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T017, T018, T005, T033

- [X] T037 [P] `widgetRepository.ts` — layout save
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/widgetRepository.ts` (modify, same file as T036)
  - **Goal**: Implement `saveLayout` — whole-tier replace inside one transaction, the atomic unit that makes concurrent-edit resolution well-defined (spec Edge Cases, plan.md's "last-write-wins per save").
  - **Acceptance Criteria**: A `saveLayout` call referencing a `widgetId` outside the dashboard is rejected before any write.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T036

- [X] T038 [P] `widgetRepository.ts` — `resolveWidgetData` dispatch
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/widgetRepository.ts` (modify, same file as T036)
  - **Goal**: Implement the five-way dispatch by `dataSourceType` per contracts/repository-api.md — delegating to 007's `analysisOperations.ts` builders (spatial stats), `featureRepository.ts` (layer data), `activityRepository.ts` (006, activity), and `dashboardAnalyticsRepository.ts` (Phase 3, platform stats); returns `{ dataSourceUnavailable: true }` (not a thrown error) for a deleted source (research.md Decision 13, FR-040).
  - **Acceptance Criteria**: No SQL/aggregation logic in this function that already exists elsewhere is duplicated.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T036

- [X] T039 Create `dashboardAnalyticsRepository.ts` — `getSnapshot`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/dashboardAnalyticsRepository.ts` (modify, from T012's shell)
  - **Goal**: Implement the compute-if-stale-else-serve function per contracts/repository-api.md and research.md Decision 12, using T012's staleness helper.
  - **Acceptance Criteria**: A second call within the TTL window returns `isCached: true` without recomputing.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T012, T026

- [X] T040 [P] `dashboardAnalyticsRepository.ts` — spatial aggregate delegation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/dashboardAnalyticsRepository.ts` (modify, same file as T039)
  - **Goal**: Implement `computeProjectStats`/`computeLayerStats`/`computeFeatureStats` by calling 007's existing `buildStatisticsSql` family — zero new spatial SQL written here (research.md Decision 5).
  - **Acceptance Criteria**: No PostGIS function call in this feature duplicates a builder 007 already exports.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T039

- [X] T041 [P] `dashboardAnalyticsRepository.ts` — new platform-count queries
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/dashboardAnalyticsRepository.ts` (modify, same file as T039)
  - **Goal**: Implement `computeSystemStats`/`computeStorageStats` — the one genuinely new aggregation surface (dashboard/widget counts, a storage-usage proxy), per research.md Decision 5.
  - **Acceptance Criteria**: Uses only simple, indexed `COUNT`/`SUM` queries — no new heavy query shape.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T039

- [X] T042 Create `dashboardShareRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/dashboardShareRepository.ts` (new)
  - **Goal**: Implement `listShares`, `grantShare`, `revokeShare`, `resolveEffectivePermission` exactly per contracts/repository-api.md (FR-023/FR-027; research.md Decision 7's "broaden, never narrow" rule).
  - **Acceptance Criteria**: `resolveEffectivePermission` is the single function every write path in `widgetRepository.ts`/`dashboardRepository.ts` calls to authorize (no duplicate permission logic elsewhere).
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T011, T020

- [X] T043 [P] Wire `resolveEffectivePermission` into `dashboardRepository.ts`/`widgetRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/dashboardRepository.ts`, `src/server/repositories/widgetRepository.ts` (both modify)
  - **Goal**: Every write function from T033–T038 now authorizes through T042's `resolveEffectivePermission` rather than a bare `assertProjectRole` call, so a `DashboardShare` override actually takes effect.
  - **Acceptance Criteria**: An Editor-broadened Viewer (via share) can now successfully call `addWidget`/`saveLayout` where a bare project-role check would have rejected them.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T036, T037, T038, T042

- [X] T044 Create `dashboardFilterRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/dashboardFilterRepository.ts` (new)
  - **Goal**: Implement `listFilters`, `createFilter` (per-`filterType` validation, `ST_IsValid` gate for spatial filters), `deleteFilter` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: A spatial filter with self-intersecting geometry is rejected before persistence.
  - **Verification**: `npx tsc --noEmit`; covered by T049
  - **Dependencies**: T022, T042

- [X] T045 Create `reportRepository.ts` — `Report` CRUD
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/reportRepository.ts` (new)
  - **Goal**: Implement `createReport` (server-side Excel/CSV/HTML generation when `fileContent` is omitted, retention-cap pruning, research.md Decision 17), `listReportsForUser` (never selects `fileContent`), `getReportFileForDownload` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: `listReportsForUser`'s query never loads blob content; the retention cap prunes correctly when exceeded.
  - **Verification**: `npx tsc --noEmit`; covered by T049
  - **Dependencies**: T013, T023, T042

- [X] T046 [P] `reportRepository.ts` — `ScheduledReport` CRUD
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/reportRepository.ts` (modify, same file as T045)
  - **Goal**: Implement `createScheduledReport`/`updateScheduledReport`/`deleteScheduledReport`, rejecting `format: "pdf"` (research.md Decision 10).
  - **Acceptance Criteria**: A `"pdf"` format request throws `ValidationError` before any row is written.
  - **Verification**: `npx tsc --noEmit`; covered by T049
  - **Dependencies**: T025, T045

- [X] T047 [P] `reportRepository.ts` — `runDueScheduledReports`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/reportRepository.ts` (modify, same file as T045)
  - **Goal**: Implement the run-due batch function per contracts/repository-api.md — per-schedule failure isolation (mirrors 007's Batch Run pattern), advances `nextRunAt` on success or failure alike.
  - **Acceptance Criteria**: One schedule's generation failure never aborts or corrupts another's in the same batch run.
  - **Verification**: `npx tsc --noEmit`; covered by T049
  - **Dependencies**: T046

- [X] T048 [P] Repository tests — dashboard/widget/analytics/share
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/dashboardRepository.test.ts` (new), `src/server/repositories/__tests__/widgetRepository.test.ts` (new), `src/server/repositories/__tests__/dashboardAnalyticsRepository.test.ts` (new), `src/server/repositories/__tests__/dashboardShareRepository.test.ts` (new)
  - **Goal**: Test every function from T033–T043 — success, not-found, forbidden, share-override-broadens-access paths, against the real PostGIS test database.
  - **Acceptance Criteria**: Every function in contracts/repository-api.md's dashboard/widget/analytics/share sections has at least one passing success test and one failure/edge-case test.
  - **Verification**: `npm run test:db -- dashboardRepository widgetRepository dashboardAnalyticsRepository dashboardShareRepository`
  - **Dependencies**: T033–T043

- [X] T049 [P] Repository tests — filter/report/scheduled-report
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/dashboardFilterRepository.test.ts` (new), `src/server/repositories/__tests__/reportRepository.test.ts` (new)
  - **Goal**: Test T044–T047, including the retention-cap prune, the `"pdf"`-schedule rejection, and `runDueScheduledReports`'s per-item isolation.
  - **Acceptance Criteria**: Matches contracts/repository-api.md's documented behavior for each function.
  - **Verification**: `npm run test:db -- dashboardFilterRepository reportRepository`
  - **Dependencies**: T044, T045, T046, T047

- [X] T050 Checkpoint (Phase 3)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the repository layer is complete and green before Phase 4 (Route Handlers) begins.
  - **Acceptance Criteria**: All of T033–T049 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T033–T049

---

## Phase 4: Route Handlers

**Purpose**: ~20 Route Handler files per contracts/api-contracts.md's
three resource families. "Export API" from the roadmap outline has no
dedicated server route — per research.md Decision 9, ad-hoc export is
client-side only; this phase covers only the "log the export/report"
persistence endpoints, not export execution itself (that's Phase 15).

- [X] T051 `GET`/`POST /api/projects/:projectId/dashboards`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/dashboards/route.ts` (new)
  - **Goal**: List (FR-001) and create (FR-001, template-aware) per api-contracts.md.
  - **Acceptance Criteria**: Matches the documented request/response/error shapes exactly.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T004, T033, T034

- [X] T052 `PATCH`/`DELETE /api/dashboards/:dashboardId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/[dashboardId]/route.ts` (new)
  - **Goal**: Rename/visibility-change (FR-024) and delete (FR-004) per api-contracts.md.
  - **Acceptance Criteria**: A non-owner, non-Project-Owner visibility-change attempt returns `403`.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T034

- [X] T053 [P] `POST /api/dashboards/:dashboardId/duplicate`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/[dashboardId]/duplicate/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-002).
  - **Acceptance Criteria**: Response is a fully independent new `Dashboard`.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T035

- [X] T054 [P] `POST`/`DELETE /api/dashboards/:dashboardId/favorite`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/[dashboardId]/favorite/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-003), idempotent.
  - **Acceptance Criteria**: Repeated `POST` is a no-op success.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T035

- [X] T055 `POST /api/dashboards/:dashboardId/widgets`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/[dashboardId]/widgets/route.ts` (new)
  - **Goal**: Add widget per api-contracts.md (FR-005/FR-006/FR-007).
  - **Acceptance Criteria**: A `config` payload failing its type-specific schema returns `400 INVALID_INPUT` before any write.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T036

- [X] T056 [P] `PATCH`/`DELETE /api/widgets/:widgetId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/widgets/[widgetId]/route.ts` (new)
  - **Goal**: Per api-contracts.md.
  - **Acceptance Criteria**: Matches documented shapes.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T036

- [X] T057 [P] `GET /api/dashboards/:dashboardId/widgets/:widgetId/data`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/[dashboardId]/widgets/[widgetId]/data/route.ts` (new)
  - **Goal**: Per api-contracts.md — returns `{ dataSourceUnavailable: true }` with `200`, never a `4xx`, for a deleted source (FR-040).
  - **Acceptance Criteria**: Applies any active `DashboardFilter` scoped to this widget/dashboard before returning.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T038

- [X] T058 `PUT /api/dashboards/:dashboardId/layout`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/[dashboardId]/layout/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-008/FR-009).
  - **Acceptance Criteria**: A batch referencing a foreign `widgetId` is rejected as `INVALID_INPUT` before any write.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T037

- [X] T059 [P] `GET`/`POST /api/dashboards/:dashboardId/shares`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/[dashboardId]/shares/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-023).
  - **Acceptance Criteria**: `403` for a non-owner, non-Project-Owner caller.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T042

- [X] T060 [P] `DELETE /api/dashboards/:dashboardId/shares/:userId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/[dashboardId]/shares/[userId]/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-027).
  - **Acceptance Criteria**: Revocation is effective on the recipient's very next request.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T042

- [X] T061 [P] `GET`/`POST /api/dashboards/:dashboardId/filters`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/[dashboardId]/filters/route.ts` (new)
  - **Goal**: Per api-contracts.md (US6/FR-020/FR-021).
  - **Acceptance Criteria**: Matches documented shapes.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T044

- [X] T062 [P] `DELETE /api/filters/:filterId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/filters/[filterId]/route.ts` (new)
  - **Goal**: Per api-contracts.md.
  - **Acceptance Criteria**: Matches documented shape.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T044

- [X] T063 [P] `GET /api/projects/:projectId/analytics/:snapshotType`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/analytics/[snapshotType]/route.ts` (new)
  - **Goal**: Per api-contracts.md (US4).
  - **Acceptance Criteria**: `isCached` correctly reflects T039's staleness check.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T039, T040, T041

- [X] T064 `POST /api/dashboards/:dashboardId/reports`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/[dashboardId]/reports/route.ts` (new)
  - **Goal**: Per api-contracts.md (US5) — handles both client-generated (`fileContent` attached) and server-generated (Excel/CSV/HTML) paths.
  - **Acceptance Criteria**: `fileContent` is never included in this endpoint's JSON response body.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T045

- [X] T065 [P] `GET /api/projects/:projectId/reports`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/reports/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-018/FR-033).
  - **Acceptance Criteria**: List response never includes `fileContent`.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T045

- [X] T066 [P] `GET /api/reports/:reportId/download`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/reports/[reportId]/download/route.ts` (new)
  - **Goal**: Per api-contracts.md — streams `fileContent` with correct `Content-Type`/`Content-Disposition`.
  - **Acceptance Criteria**: `404` for a report with no `fileContent` (failed generation).
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T045

- [X] T067 [P] `GET`/`POST /api/dashboards/:dashboardId/scheduled-reports`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/[dashboardId]/scheduled-reports/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-017); rejects `format: "pdf"`.
  - **Acceptance Criteria**: Matches documented shapes.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T046

- [X] T068 [P] `PATCH`/`DELETE /api/scheduled-reports/:scheduledReportId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/scheduled-reports/[scheduledReportId]/route.ts` (new)
  - **Goal**: Per api-contracts.md.
  - **Acceptance Criteria**: Deleting a schedule sets `Report.scheduledReportId` to `null` on its past reports (`SetNull`, unchanged behavior verified, not re-implemented).
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T046

- [X] T069 `POST /api/reports/scheduled/run-due`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/reports/scheduled/run-due/route.ts` (new)
  - **Goal**: Per api-contracts.md and research.md Decision 10 — authenticates via `X-Cron-Secret` header against the `CRON_SECRET` server-only environment variable, **not** `getCurrentUser`.
  - **Acceptance Criteria**: `401` on missing/incorrect secret; idempotent on repeat calls within the same due window.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T047

- [X] T070 [P] `GET /api/dashboard-templates`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboard-templates/route.ts` (new)
  - **Goal**: Per api-contracts.md (US8) — platform-wide, no project-scoping.
  - **Acceptance Criteria**: Returns all five seeded templates.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T030, T035

- [X] T071 [P] Fill in full `widget.schema.ts` per-type validation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/widget.schema.ts` (modify, from T004)
  - **Goal**: Replace T004's shell with a full discriminated union covering all 12 widget types' `config` shapes, mirroring `analysis.schema.ts`'s established per-operation pattern.
  - **Acceptance Criteria**: Every widget type has a complete, non-placeholder Zod variant.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T004

- [X] T072 [P] Fill in `dashboardFilter.schema.ts`/`report.schema.ts`/`dashboard.schema.ts` validation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/dashboardFilter.schema.ts`, `src/shared/contracts/report.schema.ts`, `src/shared/contracts/dashboard.schema.ts` (all modify, from T004)
  - **Goal**: Complete field validation for all three, matching api-contracts.md's request bodies exactly.
  - **Acceptance Criteria**: Every field documented in api-contracts.md has a matching Zod constraint.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T004

- [X] T073 Extend structured logging across all new routes
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: All route files touched in T051–T070
  - **Goal**: Confirm every route calls `logger.request` with method/path/status/duration (existing convention) — no route in this feature skips structured logging.
  - **Acceptance Criteria**: Matches Constitution's Logging standard.
  - **Verification**: `npx eslint src/app/api --max-warnings 0`
  - **Dependencies**: T051–T070

- [X] T074 [P] API tests — every new endpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/dashboards/__tests__/dashboards.api.test.ts` (new), `src/app/api/dashboards/__tests__/widgets.api.test.ts` (new), `src/app/api/dashboards/__tests__/sharing.api.test.ts` (new), `src/app/api/dashboards/__tests__/filters.api.test.ts` (new), `src/app/api/reports/__tests__/reports.api.test.ts` (new)
  - **Goal**: Test every endpoint in api-contracts.md — success, validation failure, `403`, `404`, `409`, `429`, and the `run-due` endpoint's shared-secret auth.
  - **Acceptance Criteria**: Every row of api-contracts.md's error table has a corresponding test case.
  - **Verification**: `npm run test:db -- dashboards.api widgets.api sharing.api filters.api reports.api`
  - **Dependencies**: T051–T073

- [X] T075 Checkpoint (Phase 4)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the full HTTP surface is complete and green before Phase 5 (Client Services) begins.
  - **Acceptance Criteria**: All of T051–T074 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T051–T074

---

## Phase 5: Client Services

**Purpose**: Client-side HTTP wrappers plus the two services permitted
real logic (report/export generation) per Constitution Principle I,
extending the new `src/features/dashboards/` module.

- [ ] T076 Create `dashboardService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/dashboardService.ts` (new)
  - **Goal**: Implement `listDashboards`, `createDashboard`, `renameDashboard`, `setVisibility`, `deleteDashboard`, `duplicateDashboard`, `setFavorite`, `listTemplates` per contracts/client-api.md — thin `apiFetch` wrappers only.
  - **Acceptance Criteria**: No method contains business logic beyond request shaping/response parsing (Constitution Principle I).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T051, T052, T053, T054, T070

- [ ] T077 [P] Create `widgetService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/widgetService.ts` (new)
  - **Goal**: Implement `addWidget`, `updateWidget`, `deleteWidget`, `getWidgetData`, `saveLayout` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's widget/layout endpoints exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T055, T056, T057, T058

- [ ] T078 [P] Create `analyticsService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/analyticsService.ts` (new)
  - **Goal**: Implement `getAnalyticsSnapshot` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's analytics endpoint exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T063

- [ ] T079 Create `captureUtils.ts` — full implementation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/captureUtils.ts` (modify, from T013's shell)
  - **Goal**: Implement `captureElementAsPng` (`html2canvas`), `buildPdfFromImages` (`jsPDF`), `buildXlsxWorkbook` (`xlsx`) per plan.md's Architecture → Export services section — the one shared utility both `reportService.ts` and `dashboardExportService.ts` call, avoiding duplication.
  - **Acceptance Criteria**: Each function is independently unit-testable given fixed input (a DOM node / image array / tabular data).
  - **Verification**: `npx tsc --noEmit`; covered by T088
  - **Dependencies**: T013, T024

- [ ] T080 [P] Create `reportService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/reportService.ts` (new)
  - **Goal**: Implement `generatePdfReport` (client-side via T079), `generateExcelReport`/`generateCsvReport`/`generateHtmlReport`, `logReport`, `listReports`, `downloadReport`, `listScheduledReports`/`createScheduledReport`/`updateScheduledReport`/`deleteScheduledReport` per contracts/client-api.md.
  - **Acceptance Criteria**: `generatePdfReport` never calls a server-side PDF-rendering endpoint (research.md Decision 9 — always client-side).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T064, T065, T066, T067, T068, T079

- [ ] T081 [P] Create `dashboardExportService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/dashboardExportService.ts` (new)
  - **Goal**: Implement whole-dashboard export, single chart/widget image export, and table-data export per contracts/client-api.md, reusing T079's `captureUtils` and `database`'s existing `exportLayerAsGeoJson` pattern for table data.
  - **Acceptance Criteria**: No capture/serialization logic is duplicated from `captureUtils.ts` or `database`'s export service.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T079

- [ ] T082 [P] Create `dashboardShareService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/dashboardShareService.ts` (new)
  - **Goal**: Thin wrappers over T059/T060's endpoints.
  - **Acceptance Criteria**: Matches api-contracts.md's sharing endpoints exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T059, T060

- [ ] T083 [P] Create `dashboardFilterService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/dashboardFilterService.ts` (new)
  - **Goal**: Thin wrappers over T061/T062's endpoints.
  - **Acceptance Criteria**: Matches api-contracts.md's filter endpoints exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T061, T062

- [ ] T084 Fill in `queryKeys.ts` factories
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/queryKeys.ts` (modify, from T009)
  - **Goal**: Complete every factory function T009 declared, matching contracts/client-api.md's full list.
  - **Acceptance Criteria**: Every hook in Phase 6 can import a matching key factory.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T009

- [ ] T085 "TemplateService"/"FavoriteService" confirmation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/dashboardService.ts` (verification, from T076)
  - **Goal**: Confirm `listTemplates`/`setFavorite` (already in `dashboardService.ts` per T076) satisfy the roadmap outline's "TemplateService"/"FavoriteService" items — per contracts/client-api.md, these are not separate service files (too small to warrant one each).
  - **Acceptance Criteria**: No duplicate/near-duplicate service file is created for either concern.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T076

- [ ] T086 "Retry policy" — disable retry for report/job-creating mutations
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useReports.ts` (documented here, configured in Phase 6)
  - **Goal**: Document/enforce `retry: false` on `useGenerateReport` and `useCreateDashboard`/`useAddWidget` — a retried creation would duplicate a report/dashboard/widget, mirroring 007's job-creation precedent.
  - **Acceptance Criteria**: No creating mutation in this feature auto-retries.
  - **Verification**: Covered by T104
  - **Dependencies**: T076, T080

- [ ] T087 "Retry policy" cont'd — bounded retry/backoff for polling
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useWidgets.ts` (documented here, configured in Phase 6)
  - **Goal**: Document/enforce a small bounded retry count with backoff for `useWidgetData`'s polling requests, so a single transient network blip doesn't stop a widget's live updates.
  - **Acceptance Criteria**: A simulated transient failure does not permanently stop polling.
  - **Verification**: Covered by T104
  - **Dependencies**: T077

- [ ] T088 [P] Service unit tests — `captureUtils`/`reportService`/`dashboardExportService`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/__tests__/captureUtils.test.ts` (new), `src/features/dashboards/services/__tests__/reportService.test.ts` (new), `src/features/dashboards/services/__tests__/dashboardExportService.test.ts` (new)
  - **Goal**: Test T079–T081 against fixed input, asserting per-format structural output validity (shell tests here — full per-format assertions land in Phases 11/15).
  - **Acceptance Criteria**: Each service's exported functions have at least one passing test.
  - **Verification**: `npm run test -- captureUtils reportService dashboardExportService`
  - **Dependencies**: T079, T080, T081

- [ ] T089 [P] Service unit tests — dashboard/widget/share/filter services
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/__tests__/dashboardService.test.ts` (new), `src/features/dashboards/services/__tests__/widgetService.test.ts` (new)
  - **Goal**: Test T076–T078, T082, T083's request-shaping correctness (mocked `apiFetch`).
  - **Acceptance Criteria**: Every exported service method has at least one passing test.
  - **Verification**: `npm run test -- dashboardService widgetService`
  - **Dependencies**: T076, T077, T078, T082, T083

- [ ] T090 Checkpoint (Phase 5)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the client service layer is complete and green before Phase 6 (React Query Hooks) begins.
  - **Acceptance Criteria**: All of T076–T089 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T076–T089

---

## Phase 6: React Query Hooks

**Purpose**: Data-fetching/mutation hooks over Phase 5's services, per
contracts/client-api.md.

- [ ] T091 Create `useDashboards.ts` — list/detail
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useDashboards.ts` (new)
  - **Goal**: Implement `useDashboards(projectId, params)`, `useDashboard(dashboardId)` per contracts/client-api.md.
  - **Acceptance Criteria**: Both use T084's centralized query keys.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T076, T084

- [ ] T092 [P] `useDashboards.ts` — create/rename/visibility mutations
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useDashboards.ts` (modify, same file as T091)
  - **Goal**: Implement `useCreateDashboard`, `useRenameDashboard`, `useSetDashboardVisibility` per contracts/client-api.md, with T086's `retry: false` on create.
  - **Acceptance Criteria**: Each invalidates `dashboards(projectId)` and, where applicable, `dashboard(id)`.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T091

- [ ] T093 [P] `useDashboards.ts` — delete/duplicate/favorite/templates
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useDashboards.ts` (modify, same file as T091)
  - **Goal**: Implement `useDeleteDashboard`, `useDuplicateDashboard`, `useSetFavorite`, `useDashboardTemplates` (long `staleTime`) per contracts/client-api.md.
  - **Acceptance Criteria**: `useDashboardTemplates`'s `staleTime` reflects its rarely-changing, platform-wide data (not re-fetched on every mount).
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T091

- [ ] T094 Create `useWidgets.ts` — CRUD mutations
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useWidgets.ts` (new)
  - **Goal**: Implement `useAddWidget`, `useUpdateWidget`, `useDeleteWidget` per contracts/client-api.md — invalidate `dashboard(dashboardId)` (widgets embedded in dashboard detail).
  - **Acceptance Criteria**: Matches contracts/client-api.md's stated invalidation targets.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T077, T084

- [ ] T095 [P] `useWidgets.ts` — `useWidgetData` polling
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useWidgets.ts` (modify, same file as T094)
  - **Goal**: Implement `useWidgetData(dashboardId, widgetId, options?)` with `refetchInterval` (research.md Decision 6, T001's constant) and viewport-pause gating (research.md Decision 16), plus T087's bounded retry/backoff.
  - **Acceptance Criteria**: Polling stops when the widget is scrolled out of view and resumes when scrolled back in.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T001, T087, T094

- [ ] T096 [P] `useWidgets.ts` — `useSaveLayout`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useWidgets.ts` (modify, same file as T094)
  - **Goal**: Implement `useSaveLayout(dashboardId)`, debounced at the call site (drag/resize-end).
  - **Acceptance Criteria**: A rapid sequence of drag-move events results in exactly one network call after the debounce window.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T094

- [ ] T097 Create `useAnalytics.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useAnalytics.ts` (new)
  - **Goal**: Implement `useAnalyticsSnapshot(projectId, snapshotType, scopeId?, options?)` with `refetchInterval` per research.md Decision 6.
  - **Acceptance Criteria**: Matches contracts/client-api.md exactly.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T078, T084

- [ ] T098 Create `useReports.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useReports.ts` (new)
  - **Goal**: Implement `useGenerateReport` (`retry: false`, T086), `useReports`, `useDownloadReport` per contracts/client-api.md.
  - **Acceptance Criteria**: `useDownloadReport` triggers a browser download, mirroring 007's `useExportResult` pattern.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T080, T084, T086

- [ ] T099 [P] Create `useScheduledReports.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useScheduledReports.ts` (new)
  - **Goal**: Implement `useScheduledReports`, `useCreateScheduledReport`, `useUpdateScheduledReport`, `useDeleteScheduledReport` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches contracts/client-api.md exactly.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T080, T084

- [ ] T100 [P] "useTemplates" confirmation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useDashboards.ts` (verification, from T093)
  - **Goal**: Confirm `useDashboardTemplates` (T093) satisfies the roadmap outline's "useTemplates" item — no separate hook file needed for one query hook.
  - **Acceptance Criteria**: No duplicate hook created.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T093

- [ ] T101 Create `useDashboardShares.ts` ("useSharing")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useDashboardShares.ts` (new)
  - **Goal**: Standard query/mutation set over T082's service.
  - **Acceptance Criteria**: Matches contracts/client-api.md exactly.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T082, T084

- [ ] T102 [P] "useFavorites" confirmation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useDashboards.ts` (verification, from T093)
  - **Goal**: Confirm `useSetFavorite` (T093) satisfies "useFavorites" — no separate file.
  - **Acceptance Criteria**: No duplicate hook created.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T093

- [ ] T103 Create `useDashboardFilters.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useDashboardFilters.ts` (new)
  - **Goal**: Standard query/mutation set over T083's service.
  - **Acceptance Criteria**: Matches contracts/client-api.md exactly.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T083, T084

- [ ] T104 [P] Hook tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/__tests__/useDashboards.test.ts` (new), `src/features/dashboards/hooks/__tests__/useWidgets.test.ts` (new), `src/features/dashboards/hooks/__tests__/useAnalytics.test.ts` (new), `src/features/dashboards/hooks/__tests__/useReports.test.ts` (new), `src/features/dashboards/hooks/__tests__/useDashboardShares.test.ts` (new), `src/features/dashboards/hooks/__tests__/useDashboardFilters.test.ts` (new)
  - **Goal**: Test every hook from T091–T103 — polling/viewport-pause behavior, debounced layout save, and every mutation's cache-invalidation targets.
  - **Acceptance Criteria**: Every hook exported from Phase 6 has at least one passing test.
  - **Verification**: `npm run test -- useDashboards useWidgets useAnalytics useReports useDashboardShares useDashboardFilters`
  - **Dependencies**: T091–T103

- [ ] T105 Cache invalidation audit — cross-feature
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useWidgets.ts` (verification, from T094)
  - **Goal**: Confirm no hook in this feature invalidates `database`'s/`analysis`'s query keys (this feature only *reads* their data via services, per plan.md's Architecture — it never mutates another feature's data, so it never needs to invalidate another feature's cache).
  - **Acceptance Criteria**: `dashboards/`'s hooks invalidate only `dashboards/`'s own query keys.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T091–T103

- [ ] T106 Cache invalidation audit — scoped invalidation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/*.ts` (verification)
  - **Goal**: Confirm each mutation invalidates only its own entity's list/detail keys — e.g., saving a filter does not invalidate `reports` or `dashboardShares`.
  - **Acceptance Criteria**: No unnecessary cross-entity invalidation.
  - **Verification**: Covered by T104
  - **Dependencies**: T091–T103

- [ ] T107 Wire `useWidgetData` into T038's `dataSourceUnavailable` shape
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useWidgets.ts` (modify, same file as T094)
  - **Goal**: Confirm the hook's return type includes the `dataSourceUnavailable` branch (FR-040) as a first-class, typed state — not an error the component must catch.
  - **Acceptance Criteria**: `WidgetRenderer` (Phase 9) can render this branch as an ordinary conditional, not a try/catch.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T038, T095

- [ ] T108 Checkpoint (Phase 6)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the hooks layer is complete and green before Phase 7 (Zustand Stores) begins.
  - **Acceptance Criteria**: All of T091–T107 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T091–T107

---

## Phase 7: Zustand Stores

**Purpose**: Client UI/configuration state. Per contracts/client-api.md
and 007's precedent, the roadmap outline's "DashboardStore"/
"WidgetStore"/"LayoutStore"/"AnalyticsStore"/"FilterStore"/"ReportStore"/
"ExportStore" map onto exactly **two** stores
(`dashboardBuilderStore`, `dashboardFilterStore`) — most of the other
named concerns are server state (owned by React Query, Phase 6), not
client UI state, per Constitution's Additional Standards ("Server state
MUST be fetched via React Query — it MUST NOT be copied into a Zustand
store as a shadow cache").

- [ ] T109 Create `dashboardBuilderStore.ts` — base fields
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/dashboardBuilderStore.ts` (new)
  - **Goal**: Implement `selectedWidgetId`, `draftWidgetConfig`, `isEditMode`, `activeBreakpoint`, `lastError` + `selectWidget`/`clearSelectedWidget`, `setDraftWidgetConfig`, `toggleEditMode`, `setActiveBreakpoint`, `setLastError`/`clearLastError` per contracts/client-api.md (covers "DashboardStore"/"WidgetStore"/"LayoutStore" concerns as fields on one store — research.md/client-api.md precedent).
  - **Acceptance Criteria**: State mutations occur only through named store actions (Constitution Principle I); session-only, no persistence.
  - **Verification**: `npx tsc --noEmit`; covered by T117
  - **Dependencies**: T006

- [ ] T110 [P] "AnalyticsStore" confirmation — no separate store
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useAnalytics.ts` (verification, from T097)
  - **Goal**: Confirm live analytics values are owned entirely by React Query's cache (T097's hook), never mirrored into a Zustand store — satisfies the roadmap outline's "AnalyticsStore" concern without violating Constitution's server-state rule.
  - **Acceptance Criteria**: No `analyticsStore.ts` file is created.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T097

- [ ] T111 Create `dashboardFilterStore.ts` — base fields
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/dashboardFilterStore.ts` (new)
  - **Goal**: Implement `activeGlobalFilters`, `hasUnsavedFilterChanges` + `setGlobalFilter`/`clearGlobalFilter`, `resetToSaved` per contracts/client-api.md — deliberately separate from `dashboardBuilderStore` since filters are viewer-facing, not editor-facing (US6).
  - **Acceptance Criteria**: A read-only viewer can change `dashboardFilterStore` state without `dashboardBuilderStore.isEditMode` ever being `true`.
  - **Verification**: `npx tsc --noEmit`; covered by T118
  - **Dependencies**: None

- [ ] T112 [P] "ReportStore"/"ExportStore" confirmation — no separate store
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useReports.ts` (verification, from T098)
  - **Goal**: Confirm report-generation/export-in-progress state is owned by React Query mutation state (`isPending`/`isError`, T098) rather than a Zustand store — satisfies the roadmap outline's "ReportStore"/"ExportStore" concerns via the existing mutation-state convention 007's `useExportResult` already established.
  - **Acceptance Criteria**: No `reportStore.ts`/`exportStore.ts` file is created.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T098

- [ ] T113 `dashboardBuilderStore.ts` — wire into widget selection flow
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/dashboardBuilderStore.ts` (modify, same file as T109)
  - **Goal**: Confirm `selectWidget`/`setDraftWidgetConfig` integrate cleanly with `useUpdateWidget` (T094) — selecting a widget populates the config panel's draft from its current `config`, matching `analysisStore.setSelectedOperationType`'s clear-on-switch precedent.
  - **Acceptance Criteria**: Switching selected widgets clears any unsaved draft from the previous selection (with an unsaved-changes warning left as a Phase 9 UI concern, not a store concern).
  - **Verification**: `npx tsc --noEmit`; covered by T117
  - **Dependencies**: T094, T109

- [ ] T114 `dashboardBuilderStore.ts` — breakpoint sync with `WidgetLayout`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/dashboardBuilderStore.ts` (modify, same file as T109)
  - **Goal**: Wire `activeBreakpoint` to default from T006's detected viewport breakpoint on mount, while still allowing explicit override (US3's "preview at a different breakpoint" editing need).
  - **Acceptance Criteria**: Opening the dashboard on a tablet-width viewport defaults `activeBreakpoint` to `"tablet"`.
  - **Verification**: `npx tsc --noEmit`; covered by T117
  - **Dependencies**: T006, T109

- [ ] T115 "Persistence" — confirm both stores are session-only
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/dashboardBuilderStore.ts`, `src/features/dashboards/store/dashboardFilterStore.ts` (both verify)
  - **Goal**: Explicitly confirm neither store uses Zustand's `persist` middleware — all durable state (layout, saved filters, favorites) is server-persisted (Phases 2–4), not client-persisted, unlike 007's `analysisPanelStore` (which persists UI chrome only, a concept this feature's dockable-panel equivalent doesn't yet have — no dockable panel is part of 008's scope).
  - **Acceptance Criteria**: No `persist` import in either store file.
  - **Verification**: Covered by T119
  - **Dependencies**: T109, T111

- [ ] T116 `dashboardFilterStore.ts` — reset-to-saved wiring
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/dashboardFilterStore.ts` (modify, same file as T111)
  - **Goal**: Wire `resetToSaved` to be called on dashboard load (populating `activeGlobalFilters` from the server-persisted `DashboardFilter` rows via `useDashboardFilters`, T103) and on an explicit "discard changes" action.
  - **Acceptance Criteria**: Reloading the page shows the last-saved filters, not an empty/default state (FR-021, SC-005).
  - **Verification**: `npx tsc --noEmit`; covered by T118
  - **Dependencies**: T103, T111

- [ ] T117 [P] Store tests — `dashboardBuilderStore`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/__tests__/dashboardBuilderStore.test.ts` (new)
  - **Goal**: Test every action from T109/T113/T114.
  - **Acceptance Criteria**: 100% of exported actions have at least one test.
  - **Verification**: `npm run test -- dashboardBuilderStore`
  - **Dependencies**: T109, T113, T114

- [ ] T118 [P] Store tests — `dashboardFilterStore`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/__tests__/dashboardFilterStore.test.ts` (new)
  - **Goal**: Test every action from T111/T116.
  - **Acceptance Criteria**: 100% of exported actions have at least one test.
  - **Verification**: `npm run test -- dashboardFilterStore`
  - **Dependencies**: T111, T116

- [ ] T119 [P] Store tests — session-only confirmation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/__tests__/dashboardBuilderStore.test.ts`, `src/features/dashboards/store/__tests__/dashboardFilterStore.test.ts` (both modify, same files as T117/T118)
  - **Goal**: Test T115 — a simulated reload (re-instantiating each store) does not retain any prior in-progress state.
  - **Acceptance Criteria**: Negative-persistence assertion present for both stores.
  - **Verification**: `npm run test -- dashboardBuilderStore dashboardFilterStore`
  - **Dependencies**: T115

- [ ] T120 [P] "WidgetStore" resize/drag transient-state confirmation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/dashboardBuilderStore.ts` (verification, from T109)
  - **Goal**: Confirm in-progress drag/resize coordinates (while a widget is actively being dragged, before drop) are owned by `react-grid-layout`'s own internal component state, not lifted into `dashboardBuilderStore` — only the *saved* layout (post drag/resize-end) reaches the store's `useSaveLayout` call path (Phase 6), avoiding a high-frequency store-update performance concern (Constitution Principle V memoization guidance).
  - **Acceptance Criteria**: No per-frame store write occurs during an active drag.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T109

- [ ] T121 [P] "LayoutStore" grouping/collapse state placement confirmation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/dashboardBuilderStore.ts` (verification, from T109)
  - **Goal**: Confirm `DashboardWidget.groupId`/`isCollapsed` (US3 grouping/collapse) are server-persisted fields read via `useDashboard`/mutated via `useUpdateWidget` (Phase 6), not duplicated into `dashboardBuilderStore` — the store only tracks *which* widget's config panel is open, never the persisted collapse state itself.
  - **Acceptance Criteria**: No shadow-cache field for `isCollapsed` exists in `dashboardBuilderStore`.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T036, T109

- [ ] T122 Store barrel export audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/index.ts` (new — public barrel)
  - **Goal**: Establish the module's public barrel, re-exporting only the hooks/types/components other features are permitted to consume (matching every other feature's `index.ts` convention) — internal store/service files are **not** re-exported, per Constitution Principle I.
  - **Acceptance Criteria**: No other feature module can `import` a `dashboards/store/*` file directly; only barrel exports are reachable.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T109, T111

- [ ] T123 [P] Selector narrowness audit
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/dashboardBuilderStore.ts`, `src/features/dashboards/store/dashboardFilterStore.ts` (both verify)
  - **Goal**: Confirm every planned consumer (Phase 9's `WidgetConfigPanel`, Phase 8's `DashboardFilterBar`) will use a narrow selector, not the whole-store hook, per Constitution Principle V.
  - **Acceptance Criteria**: Documented selector usage pattern for each store, referenced by later phases' component tasks.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T109, T111

- [ ] T124 [P] Store JSDoc audit
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/dashboardBuilderStore.ts`, `src/features/dashboards/store/dashboardFilterStore.ts` (both verify)
  - **Goal**: Confirm every exported action/selector carries a single-line JSDoc summary (Constitution Principle VIII).
  - **Acceptance Criteria**: Zero undocumented export.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T109, T111

- [ ] T125 Checkpoint (Phase 7)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the store layer is complete and green before Phase 8 (Dashboard Builder, US1) begins — this is the last cross-cutting phase before user-story-specific work starts.
  - **Acceptance Criteria**: All of T109–T124 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T109–T124

---

## Phase 8: Dashboard Builder (Priority: P1) 🎯 MVP — User Story 1 (+ User Story 3's responsive/autosave pieces)

**Goal**: A user creates, renames, deletes, duplicates, and favorites
dashboards, per spec.md US1; this phase also covers the two US3 items the
roadmap outline places here (Responsive layout, Auto save) since they are
dashboard-shell-level, not per-widget-level, concerns.

**Independent Test**: Create a dashboard, rename it, duplicate it,
favorite it, delete it — independent of any widget or analytics content
existing yet.

- [ ] T126 [US1] `DashboardListPage` shell
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardListPage.tsx` (new)
  - **Goal**: Project's dashboard list, wired to `useDashboards` (T091).
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US1.1's "appears in the project's dashboard list."
  - **Verification**: `npx tsc --noEmit`; covered by T141
  - **Dependencies**: T091

- [ ] T127 [US1] Create-dashboard dialog + template entry point
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/CreateDashboardDialog.tsx` (new)
  - **Goal**: Name input + template picker (Blank default; full template grid completed in Phase 13), wired to `useCreateDashboard` (T092).
  - **Acceptance Criteria**: FR-001 satisfied (create with a name).
  - **Verification**: `npx tsc --noEmit`; covered by T142
  - **Dependencies**: T092, T126

- [ ] T128 [US1] Create dashboard — validation and empty-name rejection
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/CreateDashboardDialog.tsx` (modify, same file as T127)
  - **Goal**: Client-side validation mirroring `dashboard.schema.ts`'s server-side rule, with an accessible inline error for an empty/duplicate name.
  - **Acceptance Criteria**: Matches api-contracts.md's `400`/`409` cases with a corresponding client-side UX.
  - **Verification**: Covered by T142
  - **Dependencies**: T127

- [ ] T129 [US1] Rename dashboard UI
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardSettingsPanel.tsx` (new — this task creates the shell + rename field)
  - **Goal**: Inline or dialog-based rename, wired to `useRenameDashboard` (T092) (spec.md Acceptance Scenario US1.2).
  - **Acceptance Criteria**: FR-001 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T142
  - **Dependencies**: T092, T126

- [ ] T130 [US1] Delete dashboard UI + confirmation
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardListPage.tsx` (modify, same file as T126)
  - **Goal**: Delete action wired to `useDeleteDashboard` (T093), gated by an `AlertDialog` confirmation (FR-004, spec.md Acceptance Scenario US1.5).
  - **Acceptance Criteria**: Deletion never proceeds without explicit confirmation.
  - **Verification**: `npx tsc --noEmit`; covered by T142
  - **Dependencies**: T093, T126

- [ ] T131 [US1] Duplicate dashboard UI
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardListPage.tsx` (modify, same file as T126)
  - **Goal**: Duplicate action wired to `useDuplicateDashboard` (T093) (spec.md Acceptance Scenario US1.3).
  - **Acceptance Criteria**: FR-002 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T142
  - **Dependencies**: T093, T126

- [ ] T132 [US1] Favorite dashboard UI
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardListPage.tsx` (modify, same file as T126)
  - **Goal**: Favorite toggle + a Favorites-filtered view, wired to `useSetFavorite` (T093) (spec.md Acceptance Scenario US1.4).
  - **Acceptance Criteria**: FR-003 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T142
  - **Dependencies**: T093, T126

- [ ] T133 [US1] Dashboard settings panel — visibility entry point
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardSettingsPanel.tsx` (modify, same file as T129)
  - **Goal**: Add the visibility (private/public) control's entry point here — full sharing behavior (permission checks, read-only enforcement) is built in Phase 12; this task only wires the UI trigger and `useSetDashboardVisibility` (T092).
  - **Acceptance Criteria**: Control is hidden entirely (not just disabled) for a caller without owner/Project-Owner permission, per `effectivePermission` (T010).
  - **Verification**: Covered by T142
  - **Dependencies**: T092, T129

- [ ] T134 [US1] Dashboard settings panel — metadata display
  - **Priority**: Should-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardSettingsPanel.tsx` (modify, same file as T129)
  - **Goal**: Display owner, created/updated timestamps, and (once Phase 12 lands) share count.
  - **Acceptance Criteria**: Read-only metadata renders correctly.
  - **Verification**: Covered by T142
  - **Dependencies**: T129

- [ ] T135 [US3] Responsive layout — breakpoint-aware `DashboardView` shell
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (new — this task creates the shell)
  - **Goal**: Mounts using T006's breakpoint helper to select which `WidgetLayout` tier to request/render (FR-010).
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US3.4.
  - **Verification**: `npx tsc --noEmit`; covered by T144
  - **Dependencies**: T006, T091, T135 self

- [ ] T136 [US3] Responsive layout — reflow verification across all three tiers
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (modify, same file as T135)
  - **Goal**: Confirm the shell correctly re-requests/re-renders the desktop/tablet/mobile `WidgetLayout` tier as the viewport crosses each threshold.
  - **Acceptance Criteria**: No overflow or unreadable arrangement at any of the three tiers.
  - **Verification**: Covered by T144
  - **Dependencies**: T135

- [ ] T137 [US3] Auto save — layout autosave wiring
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (modify, same file as T135)
  - **Goal**: Confirm T096's debounced `useSaveLayout` is the sole save path for widget position/size changes — no explicit "Save Layout" button required (matches spec.md Acceptance Scenario US3.3's "restored on reopen" with no manual save step described).
  - **Acceptance Criteria**: FR-009 satisfied without a manual save action.
  - **Verification**: Covered by T144
  - **Dependencies**: T096, T135

- [ ] T138 [US1] Auto save — dashboard rename/settings save-on-blur vs explicit-save decision
  - **Priority**: Should-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardSettingsPanel.tsx` (modify, same file as T129)
  - **Goal**: Unlike layout (autosave), rename/visibility changes use an explicit save action (a rename mid-typing should not fire a request per keystroke) — this task documents and implements that distinction.
  - **Acceptance Criteria**: Renaming does not trigger a network call until the field loses focus or an explicit save is clicked.
  - **Verification**: Covered by T142
  - **Dependencies**: T129

- [ ] T139 [US1] `DashboardListPage` — search
  - **Priority**: Should-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardListPage.tsx` (modify, same file as T126)
  - **Goal**: Client-side filter-as-you-type over the currently-loaded page (server-side search is out of scope for this phase, matching the cursor-pagination convention elsewhere).
  - **Acceptance Criteria**: Typing narrows the visible list without a full page reload.
  - **Verification**: Covered by T141
  - **Dependencies**: T126

- [ ] T140 [US1] Empty state — no dashboards yet
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardListPage.tsx` (modify, same file as T126)
  - **Goal**: A clear "create your first dashboard" empty state distinct from a loading state.
  - **Acceptance Criteria**: Matches Constitution's Additional Standards (explicit error/empty states).
  - **Verification**: Covered by T141
  - **Dependencies**: T126

- [ ] T141 [P] [US1] Component tests — `DashboardListPage`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/__tests__/DashboardListPage.test.tsx` (new)
  - **Goal**: Test list rendering, search, empty state.
  - **Acceptance Criteria**: Matches T126/T139/T140's behavior.
  - **Verification**: `npm run test -- DashboardListPage`
  - **Dependencies**: T126, T139, T140

- [ ] T142 [P] [US1] Component tests — create/rename/delete/duplicate/favorite/settings
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/__tests__/CreateDashboardDialog.test.tsx` (new), `src/features/dashboards/components/__tests__/DashboardSettingsPanel.test.tsx` (new)
  - **Goal**: Test T127–T134, T138's validation/interaction behavior.
  - **Acceptance Criteria**: Every dialog/panel action has a passing interaction test.
  - **Verification**: `npm run test -- CreateDashboardDialog DashboardSettingsPanel`
  - **Dependencies**: T127–T134, T138

- [ ] T143 [P] [US1] Integration test — full Dashboard Builder flow
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/__tests__/dashboardBuilder.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §1; asserts all of spec.md's US1 Acceptance Scenarios (1–5).
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- dashboardBuilder.integration`
  - **Dependencies**: T130, T131, T132

- [ ] T144 [P] [US3] Integration test — responsive layout + autosave
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/__tests__/dashboardResponsive.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §3 steps 3–4 (reload persistence, narrow-viewport reflow) — the remaining US3 steps (drag/resize/group) are covered in Phase 9.
  - **Acceptance Criteria**: spec.md's US3 Acceptance Scenarios 3 and 4 pass.
  - **Verification**: `npm run test -- dashboardResponsive.integration`
  - **Dependencies**: T136, T137

- [ ] T145 [US1] Checkpoint (Phase 8) — MVP validation
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1 (and US3's dashboard-shell-level pieces) are fully functional and independently testable — this is the suggested MVP stopping point.
  - **Acceptance Criteria**: quickstart.md §1 passes end-to-end manually; all of T126–T144 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T126–T144

---

## Phase 9: Widget Framework (Priority: P1) — User Story 2 (widget mechanics) + User Story 3 (grid/drag/resize/group)

**Goal**: The generic widget container/registry/grid mechanics every
widget type (Phase 10) plugs into, per spec.md US2's structural
requirements and US3's grid/drag/resize/grouping requirements.

**Independent Test**: Add two placeholder widgets, drag/resize/group them,
confirm the mechanics work — independent of which specific widget types
exist yet (Phase 10 supplies the twelve concrete renderers).

- [ ] T146 [US2] Widget registry
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/WidgetRenderer.tsx` (new)
  - **Goal**: The `type`-keyed dispatch map (T003's `WidgetType` union) routing to each concrete widget component (Phase 10 fills in the map's targets; this task establishes the dispatch mechanism with placeholder components).
  - **Acceptance Criteria**: Adding a widget type to the registry requires touching only this map plus one new component file.
  - **Verification**: `npx tsc --noEmit`; covered by T165
  - **Dependencies**: T003

- [ ] T147 [US2] Widget container shell — per-widget error boundary
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/WidgetRenderer.tsx` (modify, same file as T146)
  - **Goal**: Wrap each dispatched widget in its own React error boundary (research.md Decision 13) so one widget's render failure never blanks the dashboard.
  - **Acceptance Criteria**: A forced render error in one widget leaves every other widget on the dashboard fully functional.
  - **Verification**: `npx tsc --noEmit`; covered by T165
  - **Dependencies**: T146

- [ ] T148 [US3] `DashboardGrid` — `react-grid-layout` integration base
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardGrid.tsx` (new)
  - **Goal**: Wrap `react-grid-layout`, feeding it `WidgetLayout` rows for the active breakpoint (T135), rendering `WidgetRenderer` (T146) per item.
  - **Acceptance Criteria**: FR-008 satisfied at the rendering layer.
  - **Verification**: `npx tsc --noEmit`; covered by T166
  - **Dependencies**: T135, T146

- [ ] T149 [US3] Resize support
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardGrid.tsx` (modify, same file as T148)
  - **Goal**: Wire `react-grid-layout`'s resize handles to `useSaveLayout` (T096) via `onLayoutChange` (spec.md Acceptance Scenario US3.2).
  - **Acceptance Criteria**: FR-008 satisfied for resize.
  - **Verification**: Covered by T166
  - **Dependencies**: T096, T148

- [ ] T150 [US3] Resize support — snap-to-grid confirmation
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardGrid.tsx` (verification, same file as T148)
  - **Goal**: Confirm resized widgets always land on integer grid units (`react-grid-layout`'s default behavior, verified not overridden).
  - **Acceptance Criteria**: No fractional/pixel-precision layout value is ever saved.
  - **Verification**: Covered by T166
  - **Dependencies**: T149

- [ ] T151 [US3] Drag support
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardGrid.tsx` (modify, same file as T148)
  - **Goal**: Wire drag repositioning to `useSaveLayout` (spec.md Acceptance Scenario US3.1).
  - **Acceptance Criteria**: FR-008 satisfied for drag.
  - **Verification**: Covered by T166
  - **Dependencies**: T149

- [ ] T152 [US3] Drag support — collision/reflow confirmation
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardGrid.tsx` (verification, same file as T148)
  - **Goal**: Confirm dragging one widget onto another causes automatic reflow, never an overlap.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US3.1's "other widgets reflow."
  - **Verification**: Covered by T166
  - **Dependencies**: T151

- [ ] T153 [US3] Keyboard-operable move/resize alternative
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardGrid.tsx` (modify, same file as T148)
  - **Goal**: Arrow-key move and an explicit resize control, supplementing `react-grid-layout`'s pointer-only default (research.md Decision 14, FR/SC-008).
  - **Acceptance Criteria**: Every drag/resize action achievable by mouse is also achievable by keyboard alone.
  - **Verification**: Covered by T166
  - **Dependencies**: T148

- [ ] T154 [US2] Widget toolbar
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/WidgetRenderer.tsx` (modify, same file as T146)
  - **Goal**: Per-widget edit/remove/collapse actions, visible only when `dashboardBuilderStore.isEditMode` is true and `effectivePermission` allows writes (T010, T221 in Phase 12 completes the permission gating end-to-end).
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US2.6 (remove).
  - **Verification**: Covered by T165
  - **Dependencies**: T109, T146

- [ ] T155 [US3] Widget grouping — group creation
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardGrid.tsx` (modify, same file as T148)
  - **Goal**: UI to select 2+ widgets and set their `groupId` (via `useUpdateWidget`, T094) (spec.md Acceptance Scenario US3.5).
  - **Acceptance Criteria**: FR-011 satisfied for grouping.
  - **Verification**: Covered by T167
  - **Dependencies**: T094, T148

- [ ] T156 [US3] Widget collapse/expand UI + persistence
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/WidgetRenderer.tsx` (modify, same file as T146)
  - **Goal**: Collapse/expand toggle wired to `DashboardWidget.isCollapsed` via `useUpdateWidget` — persists across reload (FR-011).
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US3.5's persistence requirement.
  - **Verification**: Covered by T167
  - **Dependencies**: T094, T146

- [ ] T157 [US2] `WidgetConfigPanel` shell
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/WidgetConfigPanel.tsx` (new)
  - **Goal**: Type picker + a per-type form-slot dispatch (Phase 10 fills in each type's actual form fields; this task establishes the shell and wires `dashboardBuilderStore.draftWidgetConfig`, T109/T113).
  - **Acceptance Criteria**: Selecting a widget type in the picker swaps the rendered config form.
  - **Verification**: `npx tsc --noEmit`; covered by T168
  - **Dependencies**: T109, T113

- [ ] T158 [US2] `WidgetConfigPanel` — add-widget flow
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/WidgetConfigPanel.tsx` (modify, same file as T157)
  - **Goal**: Wire the "Add Widget" submit action to `useAddWidget` (T094) (FR-005).
  - **Acceptance Criteria**: A new widget appears on the grid immediately after a successful add.
  - **Verification**: Covered by T168
  - **Dependencies**: T094, T157

- [ ] T159 [US2] `WidgetConfigPanel` — edit-widget flow
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/WidgetConfigPanel.tsx` (modify, same file as T157)
  - **Goal**: Wire the "Save Changes" submit action to `useUpdateWidget` (T094), pre-filled from `dashboardBuilderStore.selectedWidgetId`'s current config (T113).
  - **Acceptance Criteria**: Editing does not create a duplicate widget.
  - **Verification**: Covered by T168
  - **Dependencies**: T094, T113, T157

- [ ] T160 [US2] `WidgetConfigPanel` — data source picker
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/WidgetConfigPanel.tsx` (modify, same file as T157)
  - **Goal**: A `dataSourceType`/`dataSourceId` selector (layer picker reusing `database`'s existing layer-list UI pattern; `AnalysisRun` picker reusing `analysis`'s history list; a fixed list for `projectStats`/`layerStats`/`featureStats`/`activity`/`systemStats`/`storageStats`) per FR-006.
  - **Acceptance Criteria**: Selecting a data source type narrows the picker to only valid choices for that type.
  - **Verification**: Covered by T168
  - **Dependencies**: T157

- [ ] T161 [US2] Widget refresh — manual refresh action
  - **Priority**: Should-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/WidgetRenderer.tsx` (modify, same file as T146)
  - **Goal**: A per-widget "refresh now" button that invalidates/refetches that one widget's `useWidgetData` query immediately, independent of its poll interval.
  - **Acceptance Criteria**: Clicking refresh updates the displayed value without waiting for the next poll tick.
  - **Verification**: Covered by T165
  - **Dependencies**: T095, T146

- [ ] T162 [US4] Widget refresh — automatic refresh indicator
  - **Priority**: Should-have
  - **User Story**: US4
  - **Files**: `src/features/dashboards/components/WidgetRenderer.tsx` (modify, same file as T146)
  - **Goal**: A subtle "last updated" timestamp/indicator so a user can see the automatic poll (T095) is active, satisfying FR-012's live-refresh requirement's visibility, not just its mechanism.
  - **Acceptance Criteria**: Timestamp updates each time `useWidgetData` resolves a fresh (non-cached) value.
  - **Verification**: Covered by T165
  - **Dependencies**: T095, T146

- [ ] T163 [US2] Widget lifecycle — add/remove/error-recovery end-to-end
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/WidgetRenderer.tsx` (verification, same file as T146)
  - **Goal**: Confirm the full lifecycle (mount → data load → optional error → optional recovery via refresh → unmount on delete) behaves correctly for a representative widget.
  - **Acceptance Criteria**: No memory leak / stale-closure poll continues after a widget is deleted.
  - **Verification**: Covered by T165
  - **Dependencies**: T146, T147, T161

- [ ] T164 [US2] `WidgetUnavailableState` / `WidgetErrorFallback` components
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/WidgetUnavailableState.tsx` (new), `src/features/dashboards/components/WidgetErrorFallback.tsx` (new)
  - **Goal**: The two explicit render branches research.md Decision 13 requires — `WidgetUnavailableState` for T107's `dataSourceUnavailable` (FR-040), `WidgetErrorFallback` as T147's error boundary's fallback UI.
  - **Acceptance Criteria**: Both are visually and semantically distinct from a loading state.
  - **Verification**: `npx tsc --noEmit`; covered by T165
  - **Dependencies**: T107, T147

- [ ] T165 [P] [US2] Component tests — widget registry, container, lifecycle
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/__tests__/WidgetRenderer.test.tsx` (new)
  - **Goal**: Test T146–T147, T154, T161–T164.
  - **Acceptance Criteria**: Error-boundary isolation (one widget's failure doesn't affect siblings) is explicitly asserted.
  - **Verification**: `npm run test -- WidgetRenderer`
  - **Dependencies**: T146, T147, T154, T161, T162, T163, T164

- [ ] T166 [P] [US3] Component tests — `DashboardGrid` drag/resize/collision/keyboard
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/__tests__/DashboardGrid.test.tsx` (new)
  - **Goal**: Test T148–T153.
  - **Acceptance Criteria**: Keyboard-only move/resize (T153) has an explicit passing test, not just pointer-based interaction.
  - **Verification**: `npm run test -- DashboardGrid`
  - **Dependencies**: T148, T149, T151, T153

- [ ] T167 [P] [US3] Component tests — grouping/collapse
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/__tests__/DashboardGrid.grouping.test.tsx` (new)
  - **Goal**: Test T155–T156.
  - **Acceptance Criteria**: Collapse state persists across a simulated reload (via a re-fetched `useDashboard`).
  - **Verification**: `npm run test -- DashboardGrid.grouping`
  - **Dependencies**: T155, T156

- [ ] T168 [P] [US2] Component tests — `WidgetConfigPanel`
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/__tests__/WidgetConfigPanel.test.tsx` (new)
  - **Goal**: Test T157–T160's add/edit/data-source-picker flows.
  - **Acceptance Criteria**: Every flow has a passing interaction test.
  - **Verification**: `npm run test -- WidgetConfigPanel`
  - **Dependencies**: T157, T158, T159, T160

- [ ] T169 [P] [US3] Integration test — remaining Dashboard Layout flow (drag/resize/group)
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/__tests__/dashboardLayout.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §3 steps 1–2, 5 (the remaining steps after Phase 8's T144 covered reload/responsive).
  - **Acceptance Criteria**: All of spec.md's US3 Acceptance Scenarios (1–5) pass across T144 + this task combined.
  - **Verification**: `npm run test -- dashboardLayout.integration`
  - **Dependencies**: T152, T155, T156

- [ ] T170 [US2] Checkpoint (Phase 9)
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1, US2's structural mechanics, and US3 all work independently — the widget framework is ready for Phase 10's concrete widget types.
  - **Acceptance Criteria**: quickstart.md §3 passes in full (combined with T144); all of T146–T169 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T146–T169

---

## Phase 10: Analytics Widgets (Priority: P1) — User Story 2 (widget types) + User Story 4 (live data)

**Goal**: The twelve concrete widget-type renderers (US2) bound to live,
refreshing data (US4).

**Independent Test**: Add one widget of each type to a dashboard and
confirm each renders correctly with its bound data; change underlying
data and confirm a data-driven widget updates within the refresh bound —
independent of layout arrangement.

- [ ] T171 [US2] Map Widget component
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/MapWidget.tsx` (new)
  - **Goal**: Thin wrapper around the `map` feature's `MapContainer` (research.md Decision 4), scoped to the widget's bound layer, registered in T146's `WidgetRenderer` map.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US2.1.
  - **Verification**: `npx tsc --noEmit`; covered by T191
  - **Dependencies**: T146, T160

- [ ] T172 [US2] Map Widget — data binding
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/MapWidget.tsx` (modify, same file as T171)
  - **Goal**: Wire `dataSourceType: "layer"` resolution (T107's `useWidgetData`) into the map's rendered layer.
  - **Acceptance Criteria**: FR-006 satisfied for Map Widget.
  - **Verification**: Covered by T191
  - **Dependencies**: T107, T171

- [ ] T173 [US2] Metric Card widget
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/MetricCardWidget.tsx` (new)
  - **Goal**: Single prominent value display, registered in `WidgetRenderer`.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US2.2 (Metric Card variant).
  - **Verification**: `npx tsc --noEmit`; covered by T191
  - **Dependencies**: T146

- [ ] T174 [US4] Metric Card — live refresh
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/dashboards/components/widgets/MetricCardWidget.tsx` (modify, same file as T173)
  - **Goal**: Wire `useWidgetData`'s poll (T095/T162) into the displayed value (spec.md Acceptance Scenario US4.1, FR-012).
  - **Acceptance Criteria**: SC-002 satisfied for this widget type.
  - **Verification**: Covered by T194
  - **Dependencies**: T162, T173

- [ ] T175 [US2] Statistics Widget
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/StatisticsWidget.tsx` (new)
  - **Goal**: Multi-value statistics display, registered in `WidgetRenderer`.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US2.2.
  - **Verification**: `npx tsc --noEmit`; covered by T191
  - **Dependencies**: T146

- [ ] T176 [US4] Statistics Widget — project/layer/feature stats binding
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/dashboards/components/widgets/StatisticsWidget.tsx` (modify, same file as T175)
  - **Goal**: Wire `dataSourceType: "projectStats" | "layerStats" | "featureStats"` (T097's `useAnalyticsSnapshot`) into the display (spec.md Acceptance Scenarios US4.1–3).
  - **Acceptance Criteria**: FR-013 satisfied; a feature-statistics binding reflects the currently selected/filtered set, not the whole project.
  - **Verification**: Covered by T194
  - **Dependencies**: T097, T175

- [ ] T177 [US2] Table Widget
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/TableWidget.tsx` (new)
  - **Goal**: Sortable, paginated attribute table, registered in `WidgetRenderer` (spec.md Acceptance Scenario US2.3).
  - **Acceptance Criteria**: FR-005 satisfied for Table.
  - **Verification**: `npx tsc --noEmit`; covered by T191
  - **Dependencies**: T146

- [ ] T178 [US2] Table Widget — server-side pagination
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/TableWidget.tsx` (modify, same file as T177)
  - **Goal**: Reuse the existing cursor-paginated Features API (research.md Decision 16) — never a client-side full-layer load.
  - **Acceptance Criteria**: SC-003's 100-widget/large-dataset target is achievable for Table Widgets specifically.
  - **Verification**: Covered by T191
  - **Dependencies**: T177

- [ ] T179 [US2] Chart Widget — shared Recharts wrapper
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/ChartWidgetBase.tsx` (new)
  - **Goal**: Shared container (legend, tooltip, responsive sizing, and the accessible data-table fallback per research.md Decision 14) every chart variant (T180–T183) composes.
  - **Acceptance Criteria**: The data-table fallback renders the exact same values as the visual chart.
  - **Verification**: `npx tsc --noEmit`; covered by T192
  - **Dependencies**: T146

- [ ] T180 [US2] Pie Chart variant
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/PieChartWidget.tsx` (new)
  - **Goal**: Registered in `WidgetRenderer`, composes `ChartWidgetBase` (spec.md Acceptance Scenario US2.4).
  - **Acceptance Criteria**: FR-005 satisfied for Pie Chart.
  - **Verification**: `npx tsc --noEmit`; covered by T192
  - **Dependencies**: T179

- [ ] T181 [US2] Bar Chart variant
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/BarChartWidget.tsx` (new)
  - **Goal**: Registered in `WidgetRenderer`, composes `ChartWidgetBase`.
  - **Acceptance Criteria**: FR-005 satisfied for Bar Chart.
  - **Verification**: `npx tsc --noEmit`; covered by T192
  - **Dependencies**: T179

- [ ] T182 [US2] Line Chart variant
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/LineChartWidget.tsx` (new)
  - **Goal**: Registered in `WidgetRenderer`, composes `ChartWidgetBase`.
  - **Acceptance Criteria**: FR-005 satisfied for Line Chart.
  - **Verification**: `npx tsc --noEmit`; covered by T192
  - **Dependencies**: T179

- [ ] T183 [US2] Area Chart variant
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/AreaChartWidget.tsx` (new)
  - **Goal**: Registered in `WidgetRenderer`, composes `ChartWidgetBase`.
  - **Acceptance Criteria**: FR-005 satisfied for Area Chart.
  - **Verification**: `npx tsc --noEmit`; covered by T192
  - **Dependencies**: T179

- [ ] T184 [US2] Gauge Widget
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/GaugeWidget.tsx` (new)
  - **Goal**: Radial/progress gauge built on Recharts primitives (research.md Decision 3), registered in `WidgetRenderer` (spec.md Acceptance Scenario US2.4).
  - **Acceptance Criteria**: FR-005 satisfied for Gauge.
  - **Verification**: `npx tsc --noEmit`; covered by T192
  - **Dependencies**: T146

- [ ] T185 [US4] Gauge Widget — threshold/live-value binding
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/dashboards/components/widgets/GaugeWidget.tsx` (modify, same file as T184)
  - **Goal**: Wire configurable thresholds (`config`) + live value (`useWidgetData`) per FR-012.
  - **Acceptance Criteria**: SC-002 satisfied for this widget type.
  - **Verification**: Covered by T194
  - **Dependencies**: T095, T184

- [ ] T186 [US2] Text Widget
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/TextWidget.tsx` (new)
  - **Goal**: Renders user-provided plain/rich text content, registered in `WidgetRenderer` (spec.md Acceptance Scenario US2.5).
  - **Acceptance Criteria**: FR-005 satisfied for Text.
  - **Verification**: `npx tsc --noEmit`; covered by T193
  - **Dependencies**: T146

- [ ] T187 [US2] Image Widget
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/ImageWidget.tsx` (new)
  - **Goal**: Renders a user-provided image (URL or upload reference), registered in `WidgetRenderer`.
  - **Acceptance Criteria**: FR-005 satisfied for Image.
  - **Verification**: `npx tsc --noEmit`; covered by T193
  - **Dependencies**: T146

- [ ] T188 [US2] HTML Widget — sanitized rendering
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/HtmlWidget.tsx` (new)
  - **Goal**: Renders sanitized HTML content (T005's `sanitizeWidgetHtml`, re-applied client-side at render as defense in depth) — registered in `WidgetRenderer` (spec.md Acceptance Scenario US2.5, FR-007).
  - **Acceptance Criteria**: A `<script>` tag in the content never executes.
  - **Verification**: `npx tsc --noEmit`; covered by T193
  - **Dependencies**: T005, T146

- [ ] T189 [US4] User Activity widget
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/dashboards/components/widgets/ActivityWidget.tsx` (new)
  - **Goal**: `dataSourceType: "activity"` binding to 006's `Activity` feed via `useWidgetData`, registered in `WidgetRenderer` (spec.md Acceptance Scenario US4.4).
  - **Acceptance Criteria**: FR-014 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T194
  - **Dependencies**: T107, T146

- [ ] T190 [US4] System Activity / Storage Usage widget
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/dashboards/components/widgets/SystemStatsWidget.tsx` (new)
  - **Goal**: `dataSourceType: "systemStats" | "storageStats"` binding (T041's platform-count aggregates via `useAnalyticsSnapshot`), visible per spec.md's Clarification (any project member can add it, values scoped to their accessible project) (spec.md Acceptance Scenario US4.5).
  - **Acceptance Criteria**: FR-015 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T194
  - **Dependencies**: T041, T097, T146

- [ ] T191 [P] [US2] Component tests — Map/Metric/Statistics/Table widgets
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/__tests__/MapWidget.test.tsx` (new), `src/features/dashboards/components/widgets/__tests__/MetricCardWidget.test.tsx` (new), `src/features/dashboards/components/widgets/__tests__/StatisticsWidget.test.tsx` (new), `src/features/dashboards/components/widgets/__tests__/TableWidget.test.tsx` (new)
  - **Goal**: Test T171–T178's rendering given valid data and given a `dataSourceUnavailable` response (T164's fallback).
  - **Acceptance Criteria**: Every widget type renders both its normal and unavailable states correctly.
  - **Verification**: `npm run test -- MapWidget MetricCardWidget StatisticsWidget TableWidget`
  - **Dependencies**: T172, T176, T178

- [ ] T192 [P] [US2] Component tests — all 4 chart variants + Gauge
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/__tests__/ChartWidgets.test.tsx` (new)
  - **Goal**: Test T179–T185, including the accessible data-table fallback rendering the same values as the chart.
  - **Acceptance Criteria**: FR/SC-008 (accessibility) verified for every chart type here, not deferred to Phase 18 alone.
  - **Verification**: `npm run test -- ChartWidgets`
  - **Dependencies**: T180, T181, T182, T183, T185

- [ ] T193 [P] [US2] Component tests — Text/Image/HTML widgets
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/widgets/__tests__/ContentWidgets.test.tsx` (new)
  - **Goal**: Test T186–T188, explicitly asserting HTML sanitization (a `<script>` tag is stripped, verified via DOM inspection, not just visual comparison).
  - **Acceptance Criteria**: FR-007 verified with an executable assertion, not a manual note.
  - **Verification**: `npm run test -- ContentWidgets`
  - **Dependencies**: T186, T187, T188

- [ ] T194 [P] [US4] Integration test — full Live Analytics flow
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/dashboards/__tests__/liveAnalytics.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §4; asserts all of spec.md's US4 Acceptance Scenarios (1–5), including the 30-second-bound refresh (SC-002) via mocked timers.
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- liveAnalytics.integration`
  - **Dependencies**: T174, T176, T185, T189, T190

- [ ] T195 [US2] Checkpoint (Phase 10)
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US4 all work independently — every widget type exists and reflects live data.
  - **Acceptance Criteria**: quickstart.md §2 and §4 both pass; all of T171–T194 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T171–T194

---

## Phase 11: Reports (Priority: P2) — User Story 5

**Goal**: A user generates PDF/Excel/CSV/HTML reports on-demand and on a
recurring schedule, per spec.md US5.

**Independent Test**: Generate a report from an existing dashboard in
each format and confirm each opens correctly in a standard external
tool — independent of scheduling.

- [ ] T196 [US5] `ReportGenerationDialog` — PDF path
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ReportGenerationDialog.tsx` (new)
  - **Goal**: Format picker + PDF generation wired to `reportService.generatePdfReport` (T080), capturing `DashboardView`'s (T135) rendered DOM (spec.md Acceptance Scenario US5.1).
  - **Acceptance Criteria**: FR-016 satisfied for PDF.
  - **Verification**: `npx tsc --noEmit`; covered by T208
  - **Dependencies**: T080, T098, T135

- [ ] T197 [US5] `ReportGenerationDialog` — persist after client generation
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ReportGenerationDialog.tsx` (modify, same file as T196)
  - **Goal**: Confirm `logReport` (T080) is called with the generated Blob immediately after successful client-side PDF assembly, so it appears in Generated Reports.
  - **Acceptance Criteria**: A generated PDF is retrievable from the Reports list without a page reload.
  - **Verification**: Covered by T208
  - **Dependencies**: T196

- [ ] T198 [US5] `ReportGenerationDialog` — Excel path
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ReportGenerationDialog.tsx` (modify, same file as T196)
  - **Goal**: Wired to `reportService.generateExcelReport` (spec.md Acceptance Scenario US5.2).
  - **Acceptance Criteria**: FR-016 satisfied for Excel.
  - **Verification**: Covered by T208
  - **Dependencies**: T196

- [ ] T199 [US5] `ReportGenerationDialog` — CSV path
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ReportGenerationDialog.tsx` (modify, same file as T196)
  - **Goal**: Wired to `reportService.generateCsvReport` (spec.md Acceptance Scenario US5.2).
  - **Acceptance Criteria**: FR-016 satisfied for CSV.
  - **Verification**: Covered by T208
  - **Dependencies**: T196

- [ ] T200 [US5] `ReportGenerationDialog` — HTML path
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ReportGenerationDialog.tsx` (modify, same file as T196)
  - **Goal**: Wired to `reportService.generateHtmlReport` (spec.md Acceptance Scenario US5.3).
  - **Acceptance Criteria**: FR-016 satisfied for HTML.
  - **Verification**: Covered by T208
  - **Dependencies**: T196

- [ ] T201 [US5] Generated Reports list UI
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ReportHistoryPanel.tsx` (new)
  - **Goal**: List wired to `useReports` (T098) (spec.md Acceptance Scenario US5.5, FR-018).
  - **Acceptance Criteria**: FR-033 satisfied (downloadable from this list).
  - **Verification**: `npx tsc --noEmit`; covered by T208
  - **Dependencies**: T098

- [ ] T202 [US5] Generated Reports list — pagination/filtering
  - **Priority**: Should-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ReportHistoryPanel.tsx` (modify, same file as T201)
  - **Goal**: Cursor pagination (reusing `useReports`' existing params) + a format filter.
  - **Acceptance Criteria**: SC-007's "locate a report in under 15 seconds" target achievable.
  - **Verification**: Covered by T208
  - **Dependencies**: T201

- [ ] T203 [US5] `ScheduledReportsPanel` — create form
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ScheduledReportsPanel.tsx` (new)
  - **Goal**: Format (Excel/CSV/HTML only — `"pdf"` not offered, research.md Decision 10) + recurrence picker, wired to `useCreateScheduledReport` (T099) (spec.md Acceptance Scenario US5.4).
  - **Acceptance Criteria**: FR-017 satisfied; the format picker structurally excludes PDF, not just validates against it.
  - **Verification**: `npx tsc --noEmit`; covered by T209
  - **Dependencies**: T099

- [ ] T204 [US5] `ScheduledReportsPanel` — pause/resume/delete
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ScheduledReportsPanel.tsx` (modify, same file as T203)
  - **Goal**: Wired to `useUpdateScheduledReport`/`useDeleteScheduledReport` (T099).
  - **Acceptance Criteria**: Deleting a schedule does not remove its past `Report` rows.
  - **Verification**: Covered by T209
  - **Dependencies**: T203

- [ ] T205 [US5] `ScheduledReportsPanel` — next-run display
  - **Priority**: Should-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ScheduledReportsPanel.tsx` (modify, same file as T203)
  - **Goal**: Shows each schedule's `nextRunAt` in the viewer's local time.
  - **Acceptance Criteria**: Matches the server-stored UTC value converted correctly.
  - **Verification**: Covered by T209
  - **Dependencies**: T203

- [ ] T206 [US5] Report download wiring
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ReportHistoryPanel.tsx` (modify, same file as T201)
  - **Goal**: Download button wired to `useDownloadReport` (T098) (FR-033).
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US9.4 (re-download unchanged).
  - **Verification**: Covered by T208
  - **Dependencies**: T098, T201

- [ ] T207 [US5] Failed-report error display
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/ReportHistoryPanel.tsx` (modify, same file as T201)
  - **Goal**: A `status: "failed"` report shows its `errorMessage` clearly and offers no broken download link (spec Edge Cases).
  - **Acceptance Criteria**: FR-019 satisfied.
  - **Verification**: Covered by T208
  - **Dependencies**: T201

- [ ] T208 [P] [US5] Component tests — `ReportGenerationDialog` all 4 formats
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/__tests__/ReportGenerationDialog.test.tsx` (new), `src/features/dashboards/components/__tests__/ReportHistoryPanel.test.tsx` (new)
  - **Goal**: Test T196–T202, T206–T207.
  - **Acceptance Criteria**: Every format's generation path and the failed-report display both have passing tests.
  - **Verification**: `npm run test -- ReportGenerationDialog ReportHistoryPanel`
  - **Dependencies**: T197, T198, T199, T200, T206, T207

- [ ] T209 [P] [US5] Component tests — `ScheduledReportsPanel`
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/__tests__/ScheduledReportsPanel.test.tsx` (new)
  - **Goal**: Test T203–T205, explicitly asserting `"pdf"` is unselectable in the format picker.
  - **Acceptance Criteria**: research.md Decision 10's constraint is verified at the UI layer, not just the schema layer.
  - **Verification**: `npm run test -- ScheduledReportsPanel`
  - **Dependencies**: T203, T204, T205

- [ ] T210 [P] [US5] Service tests — full per-format structural validity
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/services/__tests__/reportService.test.ts` (modify, extends T088)
  - **Goal**: Real structural assertions per format now that T196–T200 exist: PDF page/embedded-image presence, Excel workbook sheet/row structure, CSV column mapping, HTML self-contained document validity.
  - **Acceptance Criteria**: SC-004 satisfied structurally (manual "opens in external tool" verification is documented in T211/quickstart, not re-automated here).
  - **Verification**: `npm run test -- reportService`
  - **Dependencies**: T197, T198, T199, T200

- [ ] T211 [P] [US5] Integration test — full Reporting flow
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/__tests__/reporting.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §5; asserts all of spec.md's US5 Acceptance Scenarios (1–5).
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- reporting.integration`
  - **Dependencies**: T202, T206, T209

- [ ] T212 [P] [US5] API test — `run-due` endpoint end-to-end
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/app/api/reports/__tests__/reports.api.test.ts` (modify, extends T074)
  - **Goal**: Test the full trigger→generate→persist→advance-`nextRunAt` flow, plus per-schedule failure isolation (spec Edge Cases — scheduled report failure).
  - **Acceptance Criteria**: A batch with one failing and one succeeding schedule produces one `"failed"` and one `"succeeded"` `Report`, with `nextRunAt` advanced for both.
  - **Verification**: `npm run test:db -- reports.api`
  - **Dependencies**: T069, T211

- [ ] T213 [US5] Accessibility check — Report dialogs
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/__tests__/ReportGenerationDialog.a11y.test.tsx` (new)
  - **Goal**: Keyboard-only traversal + axe scan of T196 and T203's dialogs (FR/SC-008).
  - **Acceptance Criteria**: Zero critical/serious axe violations.
  - **Verification**: `npm run test -- ReportGenerationDialog.a11y`
  - **Dependencies**: T196, T203

- [ ] T214 [US5] Checkpoint (Phase 11)
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US5 all work independently.
  - **Acceptance Criteria**: quickstart.md §5 passes; all of T196–T213 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T196–T213

---

## Phase 12: Dashboard Sharing (Priority: P2) — User Story 7

**Goal**: A dashboard owner shares with specific members at view/edit
permission or marks it public; a read-only viewer is fully blocked from
writes, server-side, per spec.md US7.

**Independent Test**: Share a dashboard with a second user at "view"
permission and confirm that user can view but not modify it —
independent of reporting or export.

- [ ] T215 [US7] `DashboardShareDialog` shell
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/DashboardShareDialog.tsx` (new)
  - **Goal**: Dialog shell wired to `useDashboardShares` (T101).
  - **Acceptance Criteria**: Opens from `DashboardSettingsPanel` (T129) or `DashboardView` (T135)'s share action.
  - **Verification**: `npx tsc --noEmit`; covered by T227
  - **Dependencies**: T101

- [ ] T216 [US7] Grant view/edit share
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/DashboardShareDialog.tsx` (modify, same file as T215)
  - **Goal**: User picker + permission selector, wired to the grant mutation (spec.md Acceptance Scenarios US7.1–2).
  - **Acceptance Criteria**: FR-023 satisfied.
  - **Verification**: Covered by T227
  - **Dependencies**: T215

- [ ] T217 [US7] List current shares + revoke
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/DashboardShareDialog.tsx` (modify, same file as T215)
  - **Goal**: Shows every current `DashboardShare` with a revoke action (spec.md Acceptance Scenario US7.5).
  - **Acceptance Criteria**: FR-027 satisfied.
  - **Verification**: Covered by T227
  - **Dependencies**: T215

- [ ] T218 [US7] Public/private visibility toggle
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/DashboardShareDialog.tsx` (modify, same file as T215)
  - **Goal**: Completes T133's entry point — full toggle behavior wired to `useSetDashboardVisibility`, visible only to owner/Project-Owner (spec.md Acceptance Scenario US7.3).
  - **Acceptance Criteria**: FR-024 satisfied.
  - **Verification**: Covered by T227
  - **Dependencies**: T133, T215

- [ ] T219 [US7] Authenticated-only public access confirmation
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/app/api/dashboards/[dashboardId]/route.ts` (verification, from T052)
  - **Goal**: Confirm a `visibility: "public"` dashboard is still reachable only through `getCurrentUser`-authenticated requests (research.md Decision 8, FR-025) — no route bypasses authentication for public dashboards.
  - **Acceptance Criteria**: An unauthenticated request to any dashboard endpoint, public or private, is rejected identically.
  - **Verification**: Covered by T229
  - **Dependencies**: T052, T218

- [ ] T220 [US7] Private-by-default confirmation
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/server/repositories/dashboardRepository.ts` (verification, from T034)
  - **Goal**: Confirm every newly created `Dashboard` defaults to `visibility: "private"` (data-model.md's default) and that toggling to public and back to private immediately restricts access again (spec.md Acceptance Scenario US7.3).
  - **Acceptance Criteria**: No caching of the old visibility state anywhere in the request path.
  - **Verification**: Covered by T229
  - **Dependencies**: T034

- [ ] T221 [US7] `effectivePermission`-driven UI gating
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/WidgetRenderer.tsx`, `DashboardGrid.tsx` (both modify, from T154/T148)
  - **Goal**: Completes T154's permission gating — every write control (add/edit/delete/drag/resize widget, layout save) checks `Dashboard.effectivePermission` (T010) before rendering as interactive.
  - **Acceptance Criteria**: A "view"-permission viewer sees every write control either hidden or visibly disabled, never interactive.
  - **Verification**: Covered by T228
  - **Dependencies**: T010, T148, T154

- [ ] T222 [US7] Server-side write rejection confirmation
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/server/repositories/widgetRepository.ts` (verification, from T043)
  - **Goal**: Confirm every write function independently re-checks `resolveEffectivePermission` server-side — client-side hiding (T221) is a UX nicety, never the actual enforcement (FR-026, SC-006).
  - **Acceptance Criteria**: A direct API call bypassing the UI, from a "view"-permission user, is still rejected.
  - **Verification**: Covered by T229
  - **Dependencies**: T043, T221

- [ ] T223 [US7] Read-only mode banner
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (modify, from T135)
  - **Goal**: A visible, accessible (not color-only) indicator when the current user's `effectivePermission` is `"view"` (spec.md Acceptance Scenario US7.4).
  - **Acceptance Criteria**: FR requirement implied by spec Edge Cases/US7.4 satisfied.
  - **Verification**: Covered by T228
  - **Dependencies**: T010, T135

- [ ] T224 [US7] Disable drag/resize/add/edit when read-only
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/DashboardGrid.tsx` (modify, from T221)
  - **Goal**: `react-grid-layout`'s `isDraggable`/`isResizable` props are set from `effectivePermission`, not a separate ad hoc flag (single source of truth).
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US7.4's "action is prevented."
  - **Verification**: Covered by T228
  - **Dependencies**: T221

- [ ] T225 [US7] Non-member/insufficient-role denial UX
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (modify, same file as T223)
  - **Goal**: A clear "you don't have access" state (not a generic error) when `getDashboardById` returns `null`/`404` for a non-member with no share.
  - **Acceptance Criteria**: Matches the non-disclosure convention (indistinguishable from "doesn't exist," per every other feature's established pattern).
  - **Verification**: Covered by T228
  - **Dependencies**: T091, T223

- [ ] T226 [US7] Revoked-share next-access denial
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (verification, same file as T223)
  - **Goal**: Confirm a revoked share (T217) causes the *next* request from that user to fail — no client-side cache masks the revocation (spec.md Acceptance Scenario US7.5).
  - **Acceptance Criteria**: React Query's cache for a revoked user's dashboard access is not stale-served past the revocation.
  - **Verification**: Covered by T229
  - **Dependencies**: T217

- [ ] T227 [P] [US7] Component tests — `DashboardShareDialog`
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/__tests__/DashboardShareDialog.test.tsx` (new)
  - **Goal**: Test T215–T220's grant/revoke/visibility-toggle flows.
  - **Acceptance Criteria**: Every action has a passing interaction test.
  - **Verification**: `npm run test -- DashboardShareDialog`
  - **Dependencies**: T216, T217, T218

- [ ] T228 [P] [US7] Component tests — read-only mode UI gating
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/__tests__/DashboardView.readonly.test.tsx` (new)
  - **Goal**: Test T221, T223–T225 — every write control's hidden/disabled state under each `effectivePermission` value.
  - **Acceptance Criteria**: All three permission levels (`owner`/`edit`/`view`/`null`) tested explicitly.
  - **Verification**: `npm run test -- DashboardView.readonly`
  - **Dependencies**: T221, T223, T224, T225

- [ ] T229 [P] [US7] Integration test — full Sharing flow
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/__tests__/sharing.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §7; asserts all of spec.md's US7 Acceptance Scenarios (1–5), including the server-side rejection (T222) and authenticated-only public access (T219).
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- sharing.integration`
  - **Dependencies**: T219, T220, T222, T226

- [ ] T230 [US7] Checkpoint (Phase 12)
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US5 and US7 all work independently.
  - **Acceptance Criteria**: quickstart.md §7 passes; all of T215–T229 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T215–T229

---

## Phase 13: Templates (Priority: P3) — User Story 8

**Goal**: A user creates a dashboard from one of five built-in templates,
pre-populated with a sensible starting widget set, per spec.md US8.

**Independent Test**: Create a dashboard from each template and confirm
it is pre-populated with that template's expected widget set —
independent of any manual customization.

- [ ] T231 [US8] Blank template confirmation
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `prisma/seed.ts` (verification, from T030)
  - **Goal**: Confirm the seeded `"blank"` template's `widgetsBlueprint` is an empty array — equivalent to T127's default create flow with no `templateId` (spec.md Acceptance Scenario US8.1).
  - **Acceptance Criteria**: FR-028 satisfied for Blank.
  - **Verification**: Covered by T243
  - **Dependencies**: T030

- [ ] T232 [US8] Executive template blueprint
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `prisma/seed.ts` (modify, same file as T030)
  - **Goal**: Define the `"executive"` blueprint — high-level summary widgets (key metrics via Metric Card, project overview via Statistics Widget) per spec.md Acceptance Scenario US8.2.
  - **Acceptance Criteria**: FR-028 satisfied for Executive.
  - **Verification**: Covered by T243
  - **Dependencies**: T173, T175, T231

- [ ] T233 [US8] Operations template blueprint
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `prisma/seed.ts` (modify, same file as T030)
  - **Goal**: Define the `"operations"` blueprint — Activity widget + layer/feature statistics widgets per spec.md Acceptance Scenario US8.3.
  - **Acceptance Criteria**: FR-028 satisfied for Operations.
  - **Verification**: Covered by T243
  - **Dependencies**: T175, T189, T231

- [ ] T234 [US8] Environmental template blueprint
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `prisma/seed.ts` (modify, same file as T030)
  - **Goal**: Define the `"environmental"` blueprint — Map Widget + relevant statistics/chart widgets per spec.md Acceptance Scenario US8.5.
  - **Acceptance Criteria**: FR-028 satisfied for Environmental.
  - **Verification**: Covered by T243
  - **Dependencies**: T171, T175, T180, T231

- [ ] T235 [US8] Asset template blueprint
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `prisma/seed.ts` (modify, same file as T030)
  - **Goal**: Define the `"asset"` blueprint — Map Widget + Table Widget bound to a feature layer per spec.md Acceptance Scenario US8.4.
  - **Acceptance Criteria**: FR-028 satisfied for Asset.
  - **Verification**: Covered by T243
  - **Dependencies**: T171, T177, T231

- [ ] T236 [US8] Template picker UI — full grid
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/dashboards/components/TemplatePicker.tsx` (new)
  - **Goal**: Name/description/preview grid wired to `useDashboardTemplates` (T093/T100), mounted inside `CreateDashboardDialog` (T127).
  - **Acceptance Criteria**: All five templates are visually distinguishable.
  - **Verification**: `npx tsc --noEmit`; covered by T242
  - **Dependencies**: T093, T127

- [ ] T237 [US8] Template picker — instantiation wiring
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/dashboards/components/TemplatePicker.tsx` (modify, same file as T236)
  - **Goal**: Selecting a template passes its `key`/`id` into `useCreateDashboard`'s `templateId` (T092/T034's blueprint-instantiation transaction).
  - **Acceptance Criteria**: FR-028 satisfied end-to-end.
  - **Verification**: Covered by T242
  - **Dependencies**: T034, T236

- [ ] T238 [US8] "Import template" — confirm scope (template-list fetch, not file upload)
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/dashboards/components/TemplatePicker.tsx` (verification, same file as T236)
  - **Goal**: Per data-model.md's explicit scope note ("no per-project custom templates in this phase"), "importing" a template into the create flow means fetching the platform-wide catalog (T070/T236) — no file-based custom-template-upload capability is built in this phase.
  - **Acceptance Criteria**: No file-upload UI for templates exists; this scope decision is documented here rather than silently omitted.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T236

- [ ] T239 [US8] "Export template" — confirm out of scope
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: None (documentation-only task)
  - **Goal**: Per data-model.md's Validation rules, `DashboardTemplate` rows are seeded platform-wide, not user-creatable — there is no "save this dashboard as a new template" action in this phase. Documented explicitly (matching this feature's pattern of confirming, not silently dropping, roadmap-outline items the approved design documents already resolved differently).
  - **Acceptance Criteria**: No "Save as Template" UI exists; this scope decision is documented in the PR.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: None

- [ ] T240 [US8] Template-created dashboard behaves identically to manual
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (verification, from T135)
  - **Goal**: Confirm no code path checks `Dashboard.templateId` to restrict editing — a template-created dashboard is a fully ordinary dashboard from the moment it's created (spec.md Acceptance Scenario US8.6, FR-029).
  - **Acceptance Criteria**: Every US1–US7 capability works identically regardless of `templateId`.
  - **Verification**: Covered by T244
  - **Dependencies**: T135, T237

- [ ] T241 [US8] Template picker accessibility
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/dashboards/components/TemplatePicker.tsx` (modify, same file as T236)
  - **Goal**: Keyboard-navigable grid, each template card an accessible, labelled option (FR/SC-008).
  - **Acceptance Criteria**: Selectable via keyboard alone.
  - **Verification**: Covered by T242
  - **Dependencies**: T236

- [ ] T242 [P] [US8] Component tests — `TemplatePicker`
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/dashboards/components/__tests__/TemplatePicker.test.tsx` (new)
  - **Goal**: Test T236–T237, T241.
  - **Acceptance Criteria**: Selecting each of the five templates triggers the correct `createDashboard` call.
  - **Verification**: `npm run test -- TemplatePicker`
  - **Dependencies**: T236, T237, T241

- [ ] T243 [P] [US8] Component/integration tests — each template's blueprint
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/dashboards/__tests__/dashboardTemplates.test.tsx` (new)
  - **Goal**: Test T231–T235 — creating from each template produces exactly the documented starting widget set.
  - **Acceptance Criteria**: All five templates individually verified.
  - **Verification**: `npm run test -- dashboardTemplates`
  - **Dependencies**: T232, T233, T234, T235

- [ ] T244 [P] [US8] Integration test — full Templates flow
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/dashboards/__tests__/templates.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §8; asserts spec.md's US8 Acceptance Scenarios (1–6).
  - **Acceptance Criteria**: All 6 scenarios pass.
  - **Verification**: `npm run test -- templates.integration`
  - **Dependencies**: T240, T243

- [ ] T245 [US8] Checkpoint (Phase 13)
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US5, US7, and US8 all work independently.
  - **Acceptance Criteria**: quickstart.md §8 passes; all of T231–T244 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T231–T244

---

## Phase 14: Filters (Priority: P2) — User Story 6

**Goal**: A user narrows dashboard data via date/layer/project/attribute/
spatial filters, global or per-widget, per spec.md US6.

**Independent Test**: Apply a global date-range filter to a dashboard
with multiple statistics widgets and confirm every filter-aware widget's
values update — independent of report generation or sharing.

- [ ] T246 [US6] `DashboardFilterBar` shell
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/components/DashboardFilterBar.tsx` (new)
  - **Goal**: Global filter control row, wired to `dashboardFilterStore` (T111) and `useDashboardFilters` (T103).
  - **Acceptance Criteria**: Matches spec.md's US6 framing.
  - **Verification**: `npx tsc --noEmit`; covered by T258
  - **Dependencies**: T103, T111

- [ ] T247 [US6] Date filter control
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/components/DashboardFilterBar.tsx` (modify, same file as T246)
  - **Goal**: Global date-range picker (spec.md Acceptance Scenario US6.1).
  - **Acceptance Criteria**: FR-020 satisfied for date.
  - **Verification**: Covered by T258
  - **Dependencies**: T246

- [ ] T248 [US6] Date filter — widget wiring
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/hooks/useWidgets.ts` (modify, from T095)
  - **Goal**: `useWidgetData` applies the active global date filter (from `dashboardFilterStore`) to its request, so every date-aware widget updates together.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US6.1's "every date-aware widget updates."
  - **Verification**: Covered by T258
  - **Dependencies**: T095, T247

- [ ] T249 [US6] Layer filter control
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/components/DashboardFilterBar.tsx` (modify, same file as T246)
  - **Goal**: Global layer picker (spec.md Acceptance Scenario US6.2).
  - **Acceptance Criteria**: FR-020 satisfied for layer.
  - **Verification**: Covered by T258
  - **Dependencies**: T246

- [ ] T250 [US6] Layer filter — widget wiring
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/hooks/useWidgets.ts` (modify, from T095)
  - **Goal**: Widgets scoped to the filtered layer(s) show limited data.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US6.2.
  - **Verification**: Covered by T258
  - **Dependencies**: T095, T249

- [ ] T251 [US6] Project filter control + wiring
  - **Priority**: Should-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/components/DashboardFilterBar.tsx` (modify, same file as T246)
  - **Goal**: Since a `Dashboard` is single-project-scoped (data-model.md), the `"project"` `filterType` exists in the schema for forward compatibility but currently narrows only within the dashboard's own project's layers — documented as a schema-forward-compatible, currently-limited-scope implementation, not a no-op.
  - **Acceptance Criteria**: FR-020's `"project"` filter type is present and functional within the current single-project-per-dashboard constraint.
  - **Verification**: Covered by T258
  - **Dependencies**: T246

- [ ] T252 [US6] Attribute filter control
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/components/WidgetConfigPanel.tsx` (modify, from T160)
  - **Goal**: Per-widget attribute filter (value/operator/range) UI, distinct from the global filter bar (spec.md Acceptance Scenario US6.3).
  - **Acceptance Criteria**: FR-020 satisfied for attribute.
  - **Verification**: Covered by T258
  - **Dependencies**: T160

- [ ] T253 [US6] Attribute filter — widget wiring
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/hooks/useWidgets.ts` (modify, from T095)
  - **Goal**: A table/chart widget with an active attribute filter shows only matching data.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US6.3.
  - **Verification**: Covered by T258
  - **Dependencies**: T095, T252

- [ ] T254 [US6] Spatial filter — draw control
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/components/widgets/MapWidget.tsx` (modify, from T172)
  - **Goal**: A draw-an-area control on a map-bound widget, reusing the existing Leaflet-Geoman draw tools already integrated elsewhere in the app (spec.md Acceptance Scenario US6.4) — not a second draw-tool integration.
  - **Acceptance Criteria**: FR-020 satisfied for spatial.
  - **Verification**: Covered by T258
  - **Dependencies**: T172

- [ ] T255 [US6] Spatial filter — validation + widget wiring
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/server/repositories/dashboardFilterRepository.ts` (verification, from T044)
  - **Goal**: Confirm the drawn geometry passes `ST_IsValid` (T044) before persistence, and that other widgets scoped to the same filter also reflect it.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US6.4's "any other widget scoped to the same filter."
  - **Verification**: Covered by T258
  - **Dependencies**: T044, T254

- [ ] T256 [US6] Filter persistence — save + reload restore
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/components/DashboardFilterBar.tsx` (modify, same file as T246)
  - **Goal**: "Save filters" action wired to `useDashboardFilters`'s create/update mutations (T103), and T116's `resetToSaved` confirmed to restore them on dashboard load (spec.md Acceptance Scenario US6.5, FR-021, SC-005).
  - **Acceptance Criteria**: A saved filter configuration survives a full page reload.
  - **Verification**: Covered by T258
  - **Dependencies**: T103, T116, T246

- [ ] T257 [US6] Empty-filter-result state
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/components/WidgetRenderer.tsx` (modify, from T164)
  - **Goal**: A widget whose active filters produce zero results shows an explicit "no data matches" state (FR-022, spec Edge Cases), distinct from `WidgetUnavailableState` (T164 — a deleted source, not a filtered-to-zero result).
  - **Acceptance Criteria**: The two states are visually and semantically distinguishable.
  - **Verification**: Covered by T258
  - **Dependencies**: T164

- [ ] T258 [P] [US6] Component tests — `DashboardFilterBar` all filter types
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/components/__tests__/DashboardFilterBar.test.tsx` (new)
  - **Goal**: Test T246–T257.
  - **Acceptance Criteria**: Every filter type has a passing interaction + widget-effect test.
  - **Verification**: `npm run test -- DashboardFilterBar`
  - **Dependencies**: T248, T250, T251, T253, T255, T256, T257

- [ ] T259 [P] [US6] Integration test — full Filtering flow
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/__tests__/filtering.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §6; asserts all of spec.md's US6 Acceptance Scenarios (1–5).
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- filtering.integration`
  - **Dependencies**: T258

- [ ] T260 [US6] Checkpoint (Phase 14)
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US8 all work independently.
  - **Acceptance Criteria**: quickstart.md §6 passes; all of T246–T259 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T246–T259

---

## Phase 15: Export (Priority: P3) — User Story 9

**Goal**: A user exports a whole dashboard, a single chart/widget image,
or a table's data, per spec.md US9.

**Independent Test**: Export a single chart widget as an image and
confirm the downloaded file matches its current rendering — independent
of exporting the whole dashboard.

- [ ] T261 [US9] `DashboardExportMenu` shell
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/components/DashboardExportMenu.tsx` (new)
  - **Goal**: Export action menu mounted in `DashboardView`'s toolbar, wired to `dashboardExportService` (T081).
  - **Acceptance Criteria**: Matches spec.md's US9 framing.
  - **Verification**: `npx tsc --noEmit`; covered by T270
  - **Dependencies**: T081, T135

- [ ] T262 [US9] Export dashboard — whole-dashboard capture
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/components/DashboardExportMenu.tsx` (modify, same file as T261)
  - **Goal**: Wired to `dashboardExportService`'s whole-dashboard export (via T079's `captureUtils`) (spec.md Acceptance Scenario US9.1).
  - **Acceptance Criteria**: FR-030 satisfied.
  - **Verification**: Covered by T270
  - **Dependencies**: T079, T261

- [ ] T263 [US9] Export widgets/charts — single widget image
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/components/WidgetRenderer.tsx` (modify, from T161)
  - **Goal**: Per-widget "Export as image" toolbar action (extends T161's manual-refresh toolbar entry), wired to `captureElementAsPng` scoped to just that widget's DOM node (spec.md Acceptance Scenario US9.2).
  - **Acceptance Criteria**: FR-031 satisfied for both chart and non-chart widgets.
  - **Verification**: Covered by T270
  - **Dependencies**: T079, T161

- [ ] T264 [US9] Export tables — CSV
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/services/dashboardExportService.ts` (modify, from T081)
  - **Goal**: Table Widget data export as CSV, reusing `database`'s existing export pagination pattern (spec.md Acceptance Scenario US9.3).
  - **Acceptance Criteria**: FR-032 satisfied for CSV.
  - **Verification**: Covered by T271
  - **Dependencies**: T081, T177

- [ ] T265 [US9] Export tables — Excel
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/services/dashboardExportService.ts` (modify, same file as T264)
  - **Goal**: Table Widget data export as Excel, via T079's `buildXlsxWorkbook`.
  - **Acceptance Criteria**: FR-032 satisfied for Excel.
  - **Verification**: Covered by T271
  - **Dependencies**: T079, T264

- [ ] T266 [US9] Snapshot export confirmation
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/components/DashboardExportMenu.tsx` (verification, same file as T261)
  - **Goal**: Confirm T262's whole-dashboard capture *is* the "point-in-time snapshot" concept the roadmap outline names — no separate "Snapshot Export" implementation is needed beyond it.
  - **Acceptance Criteria**: No duplicate export path is created.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T262

- [ ] T267 [US9] Download Manager — streamed assembly for large exports
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/services/dashboardExportService.ts` (modify, same file as T264)
  - **Goal**: Streamed Blob-part assembly for a large table export, carrying forward 007's export-size-safety pattern.
  - **Acceptance Criteria**: A large table export does not attempt one giant in-memory string concatenation.
  - **Verification**: Covered by T271
  - **Dependencies**: T264

- [ ] T268 [US9] Download Manager — oversized-export warning
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/components/DashboardExportMenu.tsx` (modify, same file as T261)
  - **Goal**: A soft warning threshold message before attempting a very large single-file export (spec Edge Cases), never a silent truncation.
  - **Acceptance Criteria**: FR requirement implied by spec Edge Cases satisfied.
  - **Verification**: Covered by T270
  - **Dependencies**: T267

- [ ] T269 [US9] Report re-download reuse confirmation
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/components/ReportHistoryPanel.tsx` (verification, from T206)
  - **Goal**: Confirm spec.md Acceptance Scenario US9.4 ("download a previously generated report") is already fully satisfied by T206's Phase 11 work — no duplicate download path is built here.
  - **Acceptance Criteria**: No second "download report" implementation exists.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T206

- [ ] T270 [P] [US9] Component tests — `DashboardExportMenu`
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/components/__tests__/DashboardExportMenu.test.tsx` (new)
  - **Goal**: Test T261–T263, T268.
  - **Acceptance Criteria**: Every export action has a passing interaction test.
  - **Verification**: `npm run test -- DashboardExportMenu`
  - **Dependencies**: T262, T263, T268

- [ ] T271 [P] [US9] Service tests — `dashboardExportService` per-format assembly
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/services/__tests__/dashboardExportService.test.ts` (modify, extends T088)
  - **Goal**: Structural validity assertions for T264–T265, T267's outputs.
  - **Acceptance Criteria**: Every export format's output is structurally valid.
  - **Verification**: `npm run test -- dashboardExportService`
  - **Dependencies**: T265, T267

- [ ] T272 [P] [US9] Integration test — full Export flow
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/__tests__/export.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §9; asserts all of spec.md's US9 Acceptance Scenarios (1–4).
  - **Acceptance Criteria**: All 4 scenarios pass.
  - **Verification**: `npm run test -- export.integration`
  - **Dependencies**: T266, T269, T270

- [ ] T273 [US9] Accessibility check — `DashboardExportMenu`
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/dashboards/components/__tests__/DashboardExportMenu.a11y.test.tsx` (new)
  - **Goal**: Keyboard-only traversal + axe scan (FR/SC-008).
  - **Acceptance Criteria**: Zero critical/serious axe violations.
  - **Verification**: `npm run test -- DashboardExportMenu.a11y`
  - **Dependencies**: T261, T270

- [ ] T274 [US9] Checkpoint (Phase 15)
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US9 all work independently.
  - **Acceptance Criteria**: quickstart.md §9 passes; all of T261–T273 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T261–T273

---

## Phase 16: UI Components (Priority: P1) — User Story 1/3/6/7 integration + User Story 10 (Administration)

**Goal**: Final integration of every panel built in Phases 8–15 into one
cohesive `DashboardView` experience, plus the Administration capability
(US10), which the roadmap outline's phase list does not give a dedicated
numbered phase to and is therefore assembled here — the same pattern
007's tasks.md used for folding US7 into its own UI-Components phase.

**Independent Test**: Open a dashboard, confirm every panel (toolbox,
filters, sharing, reports, settings) is reachable and functions together
without conflict; as a Project Owner, confirm Administration is reachable
and accurate.

- [ ] T275 [US1] Dashboard page routing
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/app/(dashboard)/projects/[projectId]/dashboards/page.tsx` (new — exact route group matching the project's existing routing convention, verified against the app's actual route structure during implementation), `src/app/(dashboard)/projects/[projectId]/dashboards/[dashboardId]/page.tsx` (new)
  - **Goal**: Next.js pages mounting `DashboardListPage` (T126) and `DashboardView` (T135) respectively.
  - **Acceptance Criteria**: Both routes render correctly.
  - **Verification**: `npx tsc --noEmit`; covered by T294
  - **Dependencies**: T126, T135

- [ ] T276 [US1] Navigation link from app shell
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboard/components/Sidebar.tsx` (modify — the **existing, singular** app-shell feature's one permitted touch, research.md Decision 0)
  - **Goal**: Add one new navigation entry linking to the Dashboards area — no other change to the app shell.
  - **Acceptance Criteria**: The shell's existing tests still pass unmodified aside from this one new link.
  - **Verification**: `npx tsc --noEmit`; covered by T294
  - **Dependencies**: T275

- [ ] T277 [US2] Widget panel — final wiring audit
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (modify, from T135)
  - **Goal**: Confirm `WidgetConfigPanel` (T157) and `WidgetRenderer`/`DashboardGrid` (T146/T148) are fully mounted and cohesive within `DashboardView` — add-widget → appears on grid → edit → config panel reflects current state, all in one flow.
  - **Acceptance Criteria**: No dead-end in the add/edit/remove widget flow.
  - **Verification**: Covered by T294
  - **Dependencies**: T157, T158, T159, T160

- [ ] T278 [US3] Layout editor — edit-mode toggle wiring
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (modify, same file as T277)
  - **Goal**: An explicit "Edit Layout" toggle wired to `dashboardBuilderStore.isEditMode` (T109) — outside edit mode, drag/resize handles are hidden even for an Editor-permission user (deliberate UX choice: editing capability ≠ editing *mode*).
  - **Acceptance Criteria**: Toggling edit mode shows/hides `DashboardGrid`'s interactive handles without a page reload.
  - **Verification**: Covered by T294
  - **Dependencies**: T109, T221

- [ ] T279 [US6] Filter panel — final integration
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (modify, same file as T277)
  - **Goal**: Mount `DashboardFilterBar` (T246) at the top of `DashboardView`, always visible regardless of edit mode (filters are a viewer concern, per Phase 7's store-split rationale).
  - **Acceptance Criteria**: A read-only viewer can still use the filter bar.
  - **Verification**: Covered by T294
  - **Dependencies**: T246, T277

- [ ] T280 [US5] Report panel — final integration
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (modify, same file as T277)
  - **Goal**: Mount `ReportGenerationDialog`/`ReportHistoryPanel`/`ScheduledReportsPanel` (T196, T201, T203) as a Reports tab/section in `DashboardView`.
  - **Acceptance Criteria**: All three are reachable from one place.
  - **Verification**: Covered by T294
  - **Dependencies**: T196, T201, T203

- [ ] T281 [US4] `DashboardAnalyticsSummary` — dashboard-level overview
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/dashboards/components/DashboardAnalyticsSummary.tsx` (new)
  - **Goal**: A small aggregate view (total widgets, last-updated time, live-refresh status) — the "Analytics panel" the roadmap outline names, distinct from any individual analytics *widget* (Phase 10).
  - **Acceptance Criteria**: Reflects the currently-open dashboard's own widget count/state, not project-wide statistics (that's `StatisticsWidget`'s job).
  - **Verification**: `npx tsc --noEmit`; covered by T294
  - **Dependencies**: T277

- [ ] T282 [US7] Share dialog — final integration
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (modify, same file as T277)
  - **Goal**: Mount `DashboardShareDialog`'s (T215) trigger in `DashboardView`'s toolbar, visible only to owner/Project-Owner (`effectivePermission`, T010).
  - **Acceptance Criteria**: FR-023 reachable from the main dashboard view, not only from settings.
  - **Verification**: Covered by T294
  - **Dependencies**: T215, T277

- [ ] T283 [US1] Settings dialog — final integration
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (modify, same file as T277)
  - **Goal**: Mount `DashboardSettingsPanel`'s (T129) trigger in `DashboardView`'s toolbar.
  - **Acceptance Criteria**: Rename/visibility/metadata all reachable from the main view.
  - **Verification**: Covered by T294
  - **Dependencies**: T129, T277

- [ ] T284 [US10] `DashboardAdminPanel` — dashboard management list
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/dashboards/components/DashboardAdminPanel.tsx` (new)
  - **Goal**: Every dashboard in the project with owner/last-modified/sharing state (spec.md Acceptance Scenario US10.1), reusing `useDashboards` (T091) with an admin-scoped query variant.
  - **Acceptance Criteria**: FR-034 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T292
  - **Dependencies**: T091

- [ ] T285 [US10] `DashboardAdminPanel` — usage analytics
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/dashboards/components/DashboardAdminPanel.tsx` (modify, same file as T284)
  - **Goal**: View counts + most-used widget types (spec.md Acceptance Scenario US10.2), sourced from T041's platform-count aggregates.
  - **Acceptance Criteria**: FR-035 satisfied.
  - **Verification**: Covered by T292
  - **Dependencies**: T041, T284

- [ ] T286 [US10] `DashboardAdminPanel` — audit log view
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/dashboards/components/DashboardAdminPanel.tsx` (modify, same file as T284)
  - **Goal**: Every dashboard create/edit/delete/share action, reusing 006's existing `Activity` feed UI pattern (not reimplementing an audit viewer), filtered to `targetType: "dashboard" | "widget" | "report"` (research.md Decision 11) (spec.md Acceptance Scenario US10.3).
  - **Acceptance Criteria**: FR-036 satisfied.
  - **Verification**: Covered by T292
  - **Dependencies**: T284

- [ ] T287 [US10] `DashboardAdminPanel` — performance metrics
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/dashboards/components/DashboardAdminPanel.tsx` (modify, same file as T284)
  - **Goal**: Basic per-widget load-time surfacing (a slow-loading widget is identifiable) (spec.md Acceptance Scenario US10.4).
  - **Acceptance Criteria**: FR-037 satisfied.
  - **Verification**: Covered by T292
  - **Dependencies**: T284

- [ ] T288 [US10] `DashboardAdminPanel` — Project-Owner-only access gate
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/dashboards/components/DashboardAdminPanel.tsx` (modify, same file as T284)
  - **Goal**: Server- and client-side gating so only a Project Owner can open this panel — no new platform-wide admin role (spec.md's resolved Assumption, FR-038) (spec.md Acceptance Scenario US10.5).
  - **Acceptance Criteria**: An Editor-role user's attempt to open Administration is denied, both via hidden navigation and a server-side check on the underlying admin-scoped queries.
  - **Verification**: Covered by T292
  - **Dependencies**: T011, T284

- [ ] T289 [US1] Loading states audit
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardListPage.tsx`, `DashboardView.tsx`, `WidgetRenderer.tsx` (all verify/modify)
  - **Goal**: Skeleton/spinner states for every panel while its query is pending — no blank flash anywhere in the module.
  - **Acceptance Criteria**: Matches Constitution's Additional Standards.
  - **Verification**: Covered by T293
  - **Dependencies**: T126, T135, T146

- [ ] T290 [US1] Error states — top-level boundary + `lastError` banners
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (modify, same file as T277)
  - **Goal**: A React error boundary wrapping the whole `DashboardView` (Constitution's "every top-level feature mounted in the dashboard shell" rule — distinct from T147's per-widget boundaries, this is the module-level backstop), plus `dashboardBuilderStore.lastError`-driven banners for non-widget failures.
  - **Acceptance Criteria**: A failure outside any single widget (e.g., the dashboard-detail query itself failing) shows a recoverable error state, not a blank page.
  - **Verification**: Covered by T293
  - **Dependencies**: T109, T277

- [ ] T291 [US1] Empty states audit
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardListPage.tsx`, `ReportHistoryPanel.tsx`, `DashboardShareDialog.tsx`, `ScheduledReportsPanel.tsx`, `TemplatePicker.tsx` (all verify)
  - **Goal**: Confirm every list-shaped panel (dashboards/reports/shares/scheduled-reports — templates always has 5, so no empty state needed there) has a distinct, non-generic empty state (T140 already covers dashboards specifically).
  - **Acceptance Criteria**: 1:1 audit against every list component in the module.
  - **Verification**: Covered by T293
  - **Dependencies**: T140, T201, T217, T204

- [ ] T292 [P] [US10] Component tests — `DashboardAdminPanel`
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/dashboards/components/__tests__/DashboardAdminPanel.test.tsx` (new)
  - **Goal**: Test T284–T288, including the access-gate rejection for a non-Owner.
  - **Acceptance Criteria**: All four sections plus the access gate have passing tests.
  - **Verification**: `npm run test -- DashboardAdminPanel`
  - **Dependencies**: T285, T286, T287, T288

- [ ] T293 [P] [US1] Component tests — loading/error/empty states
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/__tests__/DashboardView.states.test.tsx` (new)
  - **Goal**: Test T289–T291's rendering across every panel.
  - **Acceptance Criteria**: Every state (loading/error/empty) has a passing render test.
  - **Verification**: `npm run test -- DashboardView.states`
  - **Dependencies**: T289, T290, T291

- [ ] T294 [P] [US1] Integration test — full page navigation/integration flow
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/__tests__/dashboardIntegration.test.tsx` (new)
  - **Goal**: A single session touching every panel (widgets, layout, filters, reports, sharing, settings) mounted together, confirming no conflict between them.
  - **Acceptance Criteria**: All of T275–T283 function together without regression.
  - **Verification**: `npm run test -- dashboardIntegration`
  - **Dependencies**: T277–T283

- [ ] T295 [P] [US10] Integration test — full Administration flow
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/dashboards/__tests__/administration.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §10; asserts all of spec.md's US10 Acceptance Scenarios (1–5).
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- administration.integration`
  - **Dependencies**: T292

- [ ] T296 [US1] Keyboard navigation audit — fully-integrated `DashboardView`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (verification, from T277)
  - **Goal**: Full Tab/Enter/Escape traversal across every toolbar/dialog/panel now mounted together (FR/SC-008).
  - **Acceptance Criteria**: Every action reachable via keyboard alone, including cross-panel navigation.
  - **Verification**: Manual keyboard-only pass, documented in the PR; automated in T298
  - **Dependencies**: T277–T283

- [ ] T297 [US1] ARIA labels audit — fully-integrated `DashboardView`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (verification, same file as T296)
  - **Goal**: Every control across the fully-integrated view carries an accessible name.
  - **Acceptance Criteria**: No control relies on an icon alone.
  - **Verification**: Covered by T298
  - **Dependencies**: T296

- [ ] T298 [P] [US1] Full-page accessibility test
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/dashboards/components/__tests__/DashboardView.a11y.test.tsx` (new)
  - **Goal**: Automated axe scan of `DashboardView` with every panel opened at least once during the test (widget config, filters, share, reports, settings, admin).
  - **Acceptance Criteria**: Zero critical/serious axe violations across the full integrated view.
  - **Verification**: `npm run test -- DashboardView.a11y`
  - **Dependencies**: T296, T297

- [ ] T299 [US3] Responsive integration confirmation
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (verification, same file as T277)
  - **Goal**: Confirm every panel/dialog/toolbar mounted in this phase remains usable at the mobile breakpoint (T006), not just the grid itself (Phase 9 already covered the grid alone).
  - **Acceptance Criteria**: No panel becomes unreachable or clipped at 320px width.
  - **Verification**: Covered by T294
  - **Dependencies**: T006, T277–T283

- [ ] T300 [US1] Checkpoint (Phase 16)
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: None (verification-only task)
  - **Goal**: Confirm every user story (US1–US10) now works both independently and as one integrated dashboard experience.
  - **Acceptance Criteria**: quickstart.md §10 passes; all of T275–T299 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T275–T299

---

## Phase 17: Performance

**Purpose**: Verify and tune against spec.md's Performance section (100
dashboards, 100 widgets, real-time updates, large datasets) now that
every capability exists end-to-end.

- [ ] T301 Virtualization — lazy-mount gate confirmation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/useWidgets.ts` (verification, from T095)
  - **Goal**: Confirm research.md Decision 16's viewport-gated lazy mount actually prevents all 100 widgets on a large dashboard from fetching simultaneously on open.
  - **Acceptance Criteria**: SC-003 achievable — no meaningfully degraded load time versus a smaller dashboard.
  - **Verification**: Covered by T314
  - **Dependencies**: T095

- [ ] T302 Virtualization — `DashboardListPage` at 100-dashboard scale
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/DashboardListPage.tsx` (modify, from T126)
  - **Goal**: Confirm cursor pagination (not a full list render) keeps a 100-dashboard project's list view responsive.
  - **Acceptance Criteria**: SC-003 satisfied for the list view specifically.
  - **Verification**: Covered by T313
  - **Dependencies**: T126

- [ ] T303 [P] Memoization — chart data transforms
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/widgets/ChartWidgetBase.tsx` (modify, from T179)
  - **Goal**: Memoize the raw-data-to-Recharts-series transform per widget so it doesn't recompute on every unrelated re-render.
  - **Acceptance Criteria**: No dropped frames during rapid dashboard interaction in a manual profiling pass.
  - **Verification**: Manual React DevTools Profiler review
  - **Dependencies**: T179

- [ ] T304 [P] Memoization — grid layout computations
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/DashboardGrid.tsx` (modify, from T148)
  - **Goal**: Memoize the per-breakpoint layout-array transform passed to `react-grid-layout`.
  - **Acceptance Criteria**: No unnecessary `react-grid-layout` re-initialization on unrelated state changes.
  - **Verification**: Manual React DevTools Profiler review
  - **Dependencies**: T148

- [ ] T305 [P] Memoization — Zustand selector narrowness final audit
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: All `dashboards/components/*.tsx` consumers of `dashboardBuilderStore`/`dashboardFilterStore`
  - **Goal**: Extend T123's audit now that every consumer exists — confirm no component subscribes to more store state than it renders.
  - **Acceptance Criteria**: Verified via React DevTools Profiler across the fully-built module.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T123, T300

- [ ] T306 Server aggregation — `AnalyticsSnapshot` TTL tuning
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/types/dashboardConfig.constants.ts` (modify, from T001)
  - **Goal**: Tune the TTL constant against real timing measurements now that widgets/analytics exist end-to-end (research.md Decision 12 follow-up).
  - **Acceptance Criteria**: SC-002's 30-second bound achievable in 95% of observed cases with the tuned TTL.
  - **Verification**: Covered by T314
  - **Dependencies**: T001, T039

- [ ] T307 [P] Server aggregation — platform-count query plans
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (`EXPLAIN ANALYZE` run against the test database)
  - **Goal**: Verify T041's new platform-count queries use existing indexes with no sequential scan.
  - **Acceptance Criteria**: Clean query plan documented in the PR.
  - **Verification**: Manual `EXPLAIN ANALYZE` review, documented in the PR
  - **Dependencies**: T041

- [ ] T308 [P] Caching — React Query stale/gc time review
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/queryKeys.ts` (modify, from T084, if per-query overrides are needed)
  - **Goal**: Verify dashboard/report/template listing queries avoid redundant refetches without hiding a just-completed action.
  - **Acceptance Criteria**: No unnecessary duplicate network request observed in React Query Devtools.
  - **Verification**: Manual React Query Devtools review
  - **Dependencies**: T084

- [ ] T309 [P] Caching — `AnalyticsSnapshot` cache-hit-rate spot check
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: N/A (manual/log-based spot check)
  - **Goal**: Confirm multiple concurrent viewers of the same project's analytics widgets share one recomputation within the TTL window (research.md Decision 12's stated benefit, verified not just designed).
  - **Acceptance Criteria**: `isCached: true` observed for the second+ concurrent request within the TTL.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T039

- [ ] T310 Bundle optimization — bundle-analyzer run
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (`@next/bundle-analyzer` run)
  - **Goal**: Confirm all four new dependencies' (`react-grid-layout`, `recharts`, `jspdf`+`html2canvas`, `xlsx`) gzipped sizes, per Constitution Principle V's mandatory check.
  - **Acceptance Criteria**: Each dependency's size documented in the PR; none part of the initial route bundle.
  - **Verification**: `ANALYZE=true npm run build` (or the project's existing bundle-analyzer command)
  - **Dependencies**: T024

- [ ] T311 Bundle optimization — dynamic import placement audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/*.tsx` (audit)
  - **Goal**: Confirm `DashboardGrid`/chart widgets/`captureUtils` are dynamically imported (`next/dynamic`, `ssr: false` where DOM-dependent) at their point of use, matching every prior feature's convention for heavy dependencies.
  - **Acceptance Criteria**: None of the four new dependencies appear in the initial route bundle's analysis output.
  - **Verification**: Covered by T310
  - **Dependencies**: T148, T179, T079

- [ ] T312 [P] Database optimization — full index query-plan audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (`EXPLAIN ANALYZE` run against the test database)
  - **Goal**: Verify every index across all ten new tables (data-model.md) is actually used by the query patterns this feature issues — not just declared.
  - **Acceptance Criteria**: No unused index, no missing index for a hot-path query.
  - **Verification**: Manual `EXPLAIN ANALYZE` review, documented in the PR
  - **Dependencies**: T027

- [ ] T313 [P] Performance tests — 100-dashboard project
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/dashboardRepository.performance.test.ts` (new)
  - **Goal**: Seed 100 dashboards in a project, assert `listDashboardsForProject`'s response time stays bounded (SC-003).
  - **Acceptance Criteria**: Test passes within a documented time budget; skip-if-unavailable against the real test database.
  - **Verification**: `npm run test:db -- dashboardRepository.performance`
  - **Dependencies**: T033, T302

- [ ] T314 [P] Performance tests — 100-widget dashboard
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/__tests__/DashboardGrid.performance.test.tsx` (new)
  - **Goal**: Render a dashboard with 100 widgets, assert lazy-mount (T301) keeps initial render time bounded and only in-viewport widgets fetch immediately.
  - **Acceptance Criteria**: SC-003 satisfied.
  - **Verification**: `npm run test -- DashboardGrid.performance`
  - **Dependencies**: T301, T306

- [ ] T315 Checkpoint (Phase 17)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm performance targets are met before Phase 18 (Accessibility) begins.
  - **Acceptance Criteria**: All of T301–T314 complete; SC-002/SC-003 demonstrated passing.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T301–T314

---

## Phase 18: Accessibility

**Purpose**: Final WCAG 2.2 AA verification across the full module, per
spec.md's Accessibility section (FR/SC-008), extending each phase's own
per-component checks (T135's, T199's, T213's, etc.) with a cross-module
pass.

- [ ] T316 Keyboard navigation — final cross-module audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/DashboardView.tsx` (verification, from T296)
  - **Goal**: Consolidate T153 (grid), T213 (reports), T241 (templates), T273 (export), T296 (integrated view) into one final confirmation pass.
  - **Acceptance Criteria**: Every action across the entire module reachable by keyboard alone.
  - **Verification**: Manual keyboard-only pass, documented in the PR; automated in T321
  - **Dependencies**: T153, T213, T241, T273, T296

- [ ] T317 [P] ARIA labels — final cross-module audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Every component file across the module
  - **Goal**: Consolidate every per-phase ARIA check (T297 and earlier) into one final confirmation.
  - **Acceptance Criteria**: No control anywhere in the module relies on an icon alone.
  - **Verification**: Covered by T321
  - **Dependencies**: T297

- [ ] T318 [P] Focus management — dialog/modal audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `ReportGenerationDialog.tsx`, `ScheduledReportsPanel.tsx`, `DashboardShareDialog.tsx`, `CreateDashboardDialog.tsx`, `WidgetConfigPanel.tsx` (all verify)
  - **Goal**: Every dialog/panel traps and restores focus correctly.
  - **Acceptance Criteria**: Tab never escapes an open modal; closing returns focus predictably.
  - **Verification**: Covered by T321
  - **Dependencies**: T196, T203, T215, T127, T157

- [ ] T319 [P] Screen reader support — `aria-live` regions audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `WidgetRenderer.tsx` (verify, from T162)
  - **Goal**: Confirm live-refresh indicators (T162), progress/status changes, and filter-applied confirmations all use `aria-live="polite"`, consistent with 007's established convention.
  - **Acceptance Criteria**: A screen reader announces a data update without requiring re-focus.
  - **Verification**: Covered by T322
  - **Dependencies**: T162

- [ ] T320 [P] Chart accessibility — data-table fallback completeness
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `ChartWidgetBase.tsx` (verify, from T179)
  - **Goal**: Confirm every chart variant (Bar/Line/Area/Pie/Gauge) renders its accessible data-table fallback (research.md Decision 14) with values matching the visual chart exactly.
  - **Acceptance Criteria**: No chart type is missing its fallback.
  - **Verification**: Covered by T321
  - **Dependencies**: T179, T180, T181, T182, T183, T184

- [ ] T321 [P] Automated axe verification — full module
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/__tests__/module.a11y.test.tsx` (new, extends/consolidates T298)
  - **Goal**: One automated axe scan exercising every dialog/panel/widget type across the module.
  - **Acceptance Criteria**: Zero critical/serious axe violations across the entire module.
  - **Verification**: `npm run test -- module.a11y`
  - **Dependencies**: T316, T317, T318, T320

- [ ] T322 Manual screen reader pass
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (manual verification)
  - **Goal**: NVDA/VoiceOver spot-check of quickstart.md's full walkthrough (all ten sections).
  - **Acceptance Criteria**: FR/SC-008 confirmed by an actual screen reader session, not just automated tooling.
  - **Verification**: Manual pass, documented in the PR
  - **Dependencies**: T319, T321

- [ ] T323 Responsive layouts — final accessibility-at-narrow-viewport audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `DashboardView.tsx` (verify, from T299)
  - **Goal**: Confirm every accessible name/keyboard path from T316–T320 remains correct at the mobile breakpoint, not just at desktop width.
  - **Acceptance Criteria**: No accessibility regression at 320px width.
  - **Verification**: Covered by T321
  - **Dependencies**: T299, T321

- [ ] T324 Checkpoint (Phase 18)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm accessibility is complete and green before Phase 19 (Testing) begins.
  - **Acceptance Criteria**: All of T316–T323 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T316–T323

---

## Phase 19: Testing

**Purpose**: Full-coverage audit and gap-fill across every tier, plus
cross-story journeys not exercised by any single phase's checkpoint —
mirroring 007's Phase 19 structure. Most tier-specific tests were already
written per-layer (Phases 3–7) and per-story (Phases 8–16); this phase
confirms completeness rather than duplicating them.

- [ ] T325 Repository test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm every function in contracts/repository-api.md has a passing test (cross-reference T048/T049).
  - **Acceptance Criteria**: 100% of documented repository functions covered.
  - **Verification**: Manual coverage checklist against contracts/repository-api.md, documented in the PR
  - **Dependencies**: T048, T049

- [ ] T326 [P] Repository tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T325.
  - **Acceptance Criteria**: T325's checklist reaches 100%.
  - **Verification**: `npm run test:db`
  - **Dependencies**: T325

- [ ] T327 API test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/**/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm every endpoint in api-contracts.md has success/validation/`403`/`404`/`409`/`429` coverage (cross-reference T074).
  - **Acceptance Criteria**: 100% of documented endpoints × documented error codes covered.
  - **Verification**: Manual coverage checklist against api-contracts.md, documented in the PR
  - **Dependencies**: T074

- [ ] T328 [P] API tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/**/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T327.
  - **Acceptance Criteria**: T327's checklist reaches 100%.
  - **Verification**: `npm run test:db`
  - **Dependencies**: T327

- [ ] T329 Service test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm every service method (contracts/client-api.md) is tested (cross-reference T088/T089, T210, T271).
  - **Acceptance Criteria**: 100% of documented service methods covered.
  - **Verification**: Manual coverage checklist, documented in the PR
  - **Dependencies**: T088, T089, T210, T271

- [ ] T330 [P] Service tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/services/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T329.
  - **Acceptance Criteria**: T329's checklist reaches 100%.
  - **Verification**: `npm run test`
  - **Dependencies**: T329

- [ ] T331 Hook test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm every hook in contracts/client-api.md is tested (cross-reference T104).
  - **Acceptance Criteria**: 100% of documented hooks covered.
  - **Verification**: Manual coverage checklist against contracts/client-api.md, documented in the PR
  - **Dependencies**: T104

- [ ] T332 [P] Hook tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/hooks/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T331.
  - **Acceptance Criteria**: T331's checklist reaches 100%.
  - **Verification**: `npm run test`
  - **Dependencies**: T331

- [ ] T333 Store test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm `dashboardBuilderStore`/`dashboardFilterStore` full action/selector coverage (cross-reference T117–T119).
  - **Acceptance Criteria**: 100% of exported actions/selectors covered.
  - **Verification**: Manual coverage checklist, documented in the PR
  - **Dependencies**: T117, T118, T119

- [ ] T334 [P] Store tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/store/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T333.
  - **Acceptance Criteria**: T333's checklist reaches 100%.
  - **Verification**: `npm run test`
  - **Dependencies**: T333

- [ ] T335 Dashboard test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/__tests__/DashboardGrid.test.tsx`, `DashboardView.*.test.tsx` (review only)
  - **Goal**: Confirm `DashboardGrid`/`DashboardView`'s full drag/resize/collision/responsive/group/collapse/integration behavior (T166, T167, T169, T294) is covered without gaps.
  - **Acceptance Criteria**: 100% coverage against plan.md's Testing Strategy "Dashboard" tier.
  - **Verification**: Manual coverage checklist, documented in the PR
  - **Dependencies**: T166, T167, T169, T294

- [ ] T336 [P] Dashboard tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/__tests__/DashboardGrid.test.tsx`, `DashboardView.*.test.tsx` (modify as needed)
  - **Goal**: Add any coverage gaps found in T335.
  - **Acceptance Criteria**: T335's checklist reaches 100%.
  - **Verification**: `npm run test`
  - **Dependencies**: T335

- [ ] T337 Widget test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/widgets/__tests__/*.test.tsx` (review only)
  - **Goal**: Confirm all 12 widget types (T191–T193) each have normal-render, unavailable-state, and error-boundary-isolation coverage per plan.md's Testing Strategy "Widget" tier.
  - **Acceptance Criteria**: 12/12 widget types fully covered.
  - **Verification**: Manual coverage checklist, documented in the PR
  - **Dependencies**: T191, T192, T193

- [ ] T338 [P] Widget tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/widgets/__tests__/*.test.tsx` (modify as needed)
  - **Goal**: Add any coverage gaps found in T337.
  - **Acceptance Criteria**: T337's checklist reaches 100%.
  - **Verification**: `npm run test`
  - **Dependencies**: T337

- [ ] T339 [P] Integration test — Template → Widgets → Share → Report cross-story journey
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/__tests__/crossStory.templateShareReport.test.tsx` (new)
  - **Goal**: Create from Executive template → add a widget → share with a second user at "view" → generate a PDF report, spanning US8/US2/US7/US5.
  - **Acceptance Criteria**: All four stories' behavior holds correctly in one continuous session.
  - **Verification**: `npm run test -- crossStory.templateShareReport`
  - **Dependencies**: T245, T230, T214

- [ ] T340 [P] Integration test — Filter → Export → Admin-audit cross-story journey
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/__tests__/crossStory.filterExportAudit.test.tsx` (new)
  - **Goal**: Apply a global filter → export a filtered widget → confirm the Administration audit log reflects both actions, spanning US6/US9/US10.
  - **Acceptance Criteria**: The audit log entry for the export action reflects the filter that was active at export time (informational, not required to persist filter state on the `Activity` row beyond `metadata`).
  - **Verification**: `npm run test -- crossStory.filterExportAudit`
  - **Dependencies**: T260, T274, T295

- [ ] T341 [P] Integration test — full quickstart.md run-through
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/__tests__/quickstart.fullRun.test.tsx` (new, automating what's automatable from quickstart.md's ten sections)
  - **Goal**: A single continuous session touching every one of quickstart.md's ten sections in order.
  - **Acceptance Criteria**: All ten sections pass without requiring app state reset between them.
  - **Verification**: `npm run test -- quickstart.fullRun`
  - **Dependencies**: T145, T170, T195, T214, T230, T245, T260, T274, T300

- [ ] T342 Performance test audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/dashboardRepository.performance.test.ts`, `src/features/dashboards/components/__tests__/DashboardGrid.performance.test.tsx` (review only, from T313/T314)
  - **Goal**: Confirm T313/T314 pass against CI-representative hardware/data volume, not just a developer's local machine.
  - **Acceptance Criteria**: Both tests green in CI.
  - **Verification**: CI run review
  - **Dependencies**: T313, T314

- [ ] T343 Accessibility test audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/components/__tests__/module.a11y.test.tsx` (review only, from T321)
  - **Goal**: Confirm zero violations are maintained after Phase 17's performance-tuning changes (a memoization pass can occasionally regress accessibility if a ref/focus target is memoized incorrectly).
  - **Acceptance Criteria**: T321 still green after Phase 17.
  - **Verification**: `npm run test -- module.a11y`
  - **Dependencies**: T315, T321

- [ ] T344 Full suite run
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: Run the entire test suite (all tiers) and confirm green, with zero skipped tests other than documented skip-if-unavailable DB tests.
  - **Acceptance Criteria**: `npm run test` and `npm run test:db` both fully green.
  - **Verification**: `npm run test && npm run test:db`
  - **Dependencies**: T326, T328, T330, T332, T334, T336, T338, T339, T340, T341, T342, T343

- [ ] T345 Checkpoint (Phase 19)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the entire feature is fully tested before Phase 20 (Documentation & Final Quality Gate) begins.
  - **Acceptance Criteria**: All of T325–T344 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T325–T344

---

## Phase 20: Documentation & Final Quality Gate

**Purpose**: Documentation per Constitution Principle VIII and the final,
whole-feature quality gate per Constitution Principle X.

- [ ] T346 README
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/README.md` (new)
  - **Goal**: Purpose, public API (barrel exports from `index.ts`, T122), a usage example, and known limitations (Constitution Principle VIII) — explicitly noting the naming distinction from the existing `dashboard/` (singular) app-shell module (research.md Decision 0), since this is the single most likely point of confusion for a future contributor.
  - **Acceptance Criteria**: A new contributor can understand this feature's scope, entry points, and the naming distinction from this file alone.
  - **Verification**: Manual review
  - **Dependencies**: T300, T345

- [ ] T347 [P] Architecture docs — environment variable audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/environment-variables.md`, `.env.example` (both modify)
  - **Goal**: Document `CRON_SECRET` (research.md Decision 10, plan.md Deployment Notes) — the one new environment variable this feature introduces.
  - **Acceptance Criteria**: `.env.example` includes a placeholder entry with a comment explaining its purpose; no other new environment variable exists undocumented.
  - **Verification**: Manual review
  - **Dependencies**: T069

- [ ] T348 [P] API documentation — JSDoc audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Every new/modified exported function across this feature
  - **Goal**: Confirm every new/modified Route Handler and repository function carries the required single-line JSDoc summary (Constitution Principle VIII).
  - **Acceptance Criteria**: Zero exported function in this feature's scope lacks a summary.
  - **Verification**: Manual review (or an ESLint `jsdoc` rule if the project has one configured)
  - **Dependencies**: T300, T345

- [ ] T349 [P] Deployment guide — cron trigger setup per target
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify)
  - **Goal**: Document plan.md's Deployment Notes table (Vercel Cron / Railway Cron / Docker crontab / AWS EventBridge / Supabase `pg_cron`) for triggering `POST /api/reports/scheduled/run-due`, including the `CRON_SECRET` header configuration for each.
  - **Acceptance Criteria**: Matches plan.md's Deployment Notes content exactly.
  - **Verification**: Manual review
  - **Dependencies**: T069, T347

- [ ] T350 [P] Deployment guide — PostGIS version requirement carryover
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify, same file as T349)
  - **Goal**: Confirm this feature introduces no new PostGIS version requirement beyond what 007 already documented (this feature only reuses 007's existing statistics functions, per research.md Decision 5) — state this explicitly rather than leaving it unaddressed.
  - **Acceptance Criteria**: Deployment doc contains an explicit "no new PostGIS requirement" note for this feature.
  - **Verification**: Manual review
  - **Dependencies**: T040

- [ ] T351 [P] Developer guide — widget-type-extension pattern
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/README.md` (modify, same file as T346)
  - **Goal**: Document how to add a 13th widget type (touch `WidgetType`, `widget.schema.ts`, the registry map, one new component) as a reusable reference for future contributors.
  - **Acceptance Criteria**: Steps match T003/T071/T146's actual extension points.
  - **Verification**: Manual review
  - **Dependencies**: T346

- [ ] T352 [P] Developer guide — consolidation rationale
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/README.md` (modify, same file as T346)
  - **Goal**: Document why "WidgetConfiguration," "TemplateRepository," "FavoriteRepository," "AnalyticsStore," "ReportStore," "ExportStore" etc. from the original roadmap outline are not separate tables/files/stores, referencing research.md's and data-model.md's specific decisions, so a future contributor doesn't reintroduce them.
  - **Acceptance Criteria**: The rationale is discoverable from the feature's own README, not only from `specs/008-dashboard-analytics/`.
  - **Verification**: Manual review
  - **Dependencies**: T346

- [ ] T353 [P] Developer guide — Report vs. ad-hoc export persistence distinction
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/dashboards/README.md` (modify, same file as T346)
  - **Goal**: Document research.md Decisions 9/17's distinction (persisted `Report` vs. unpersisted ad-hoc export) — the one place in this feature most likely to confuse a future contributor into either persisting an export or failing to persist a scheduled report.
  - **Acceptance Criteria**: Both code paths' rationale is discoverable from the README.
  - **Verification**: Manual review
  - **Dependencies**: T346

- [ ] T354 Quickstart verification — final manual pass
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (manual verification against quickstart.md)
  - **Goal**: Execute quickstart.md end-to-end manually one final time post-implementation, all ten sections plus the Failure/recovery scenarios.
  - **Acceptance Criteria**: Every scenario in quickstart.md behaves exactly as documented.
  - **Verification**: Manual pass, documented in the PR description
  - **Dependencies**: T345

- [ ] T355 Final quality gate — TypeScript
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: Zero TypeScript errors across the entire changed surface.
  - **Acceptance Criteria**: Clean `tsc --noEmit` run.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T345

- [ ] T356 Final quality gate — ESLint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: Zero ESLint errors or warnings.
  - **Acceptance Criteria**: Clean `eslint src --max-warnings 0` run.
  - **Verification**: `npm run lint`
  - **Dependencies**: T345

- [ ] T357 Final quality gate — production build + bundle analyzer
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: `next build` succeeds; bundle-analyzer (T310) confirms all four new dependencies' sizes are acceptable and none are in the initial route bundle.
  - **Acceptance Criteria**: Clean production build; no bundle-size regression beyond what T310 already accepted.
  - **Verification**: `npm run build`
  - **Dependencies**: T310, T345

- [ ] T358 Final quality gate — Constitution Check re-verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only, cross-referencing plan.md's Constitution Check table)
  - **Goal**: Re-verify plan.md's Constitution Check table against the actual implementation.
  - **Acceptance Criteria**: Zero principle violation found that isn't already documented in plan.md's Complexity Tracking.
  - **Verification**: Manual cross-reference audit, documented in the PR description
  - **Dependencies**: T355, T356, T357

- [ ] T359 Final quality gate — FR/SC traceability audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only, cross-referencing spec.md)
  - **Goal**: Confirm every FR-001–FR-043 and SC-001–SC-008 from spec.md has at least one traceable passing task/test from this file.
  - **Acceptance Criteria**: Zero FR/SC without a traceable task.
  - **Verification**: Manual cross-reference audit, documented in the PR description
  - **Dependencies**: T358

- [ ] T360 Final quality gate — Checkpoint (Phase 20)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: This feature's final phase checkpoint — the whole-suite verification below must be green before the feature is considered complete.
  - **Acceptance Criteria**: All of T346–T359 complete; the full command suite below passes clean.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T346–T359

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundation)**: No dependencies — start immediately.
- **Phase 2 (Database)**: Depends on Phase 1 (needs T001's constants, T002/T003's types).
- **Phase 3 (Repository Layer)**: Depends on Phase 2 (needs the migrated schema) and on 006-collaboration's `assertProjectRole` / 007-spatial-analysis's `analysisOperations.ts` (T011, T040 — external dependencies, see Complexity Tracking).
- **Phase 4 (Route Handlers)**: Depends on Phase 3 (needs repository functions to call).
- **Phase 5 (Client Services)**: Depends on Phase 4 (needs endpoints to wrap).
- **Phase 6 (React Query Hooks)**: Depends on Phase 5 (needs services to call).
- **Phase 7 (Zustand Stores)**: Can start in parallel with Phase 6 (no direct dependency between them), but both must complete before Phase 8.
- **Phases 8–16 (User Stories US1–US10)**: All depend on Phase 7 completing. Phases 8, 9, 10, 11 correspond to the four P1 stories (US1, US2/US3's mechanics, US2/US4's widget types, — note US5 in Phase 11 is P2, sequenced here because report generation needs a populated dashboard to be meaningfully testable) and are best built in the given order (8→9→10) since each is a direct prerequisite for the next being demonstrable, even though US1/US2/US3/US4 are independently *specified*. Phases 12–16 (US7, US8, US6, US9, US10) can proceed largely in parallel once Phase 10 lands.
  - **Important structural note**: Unlike 007's tasks.md (where every operation-category phase was fully parallel-independent), this feature's Phases 8–10 have a genuine build-order dependency — Phase 9's grid mechanics need *some* widget to drag/resize (even a placeholder), and Phase 10's twelve widget types need Phase 9's registry/container to plug into. Phases 11–16 do not have this same tight coupling and are independent of each other once Phase 10 exists.
- **Phase 17 (Performance)**: Depends on all of Phases 8–16 (needs every capability and the full UI to exist to measure/tune).
- **Phase 18 (Accessibility)**: Depends on Phase 16 (needs the full component tree); can run in parallel with Phase 17.
- **Phase 19 (Testing)**: Depends on Phases 17 and 18 (audits their output).
- **Phase 20 (Documentation & Final Quality Gate)**: Depends on Phase 19.

### User Story Dependencies

- **US1 (Dashboard Builder, P1)**: No dependency on other stories — first candidate for MVP.
- **US2 (Widgets, P1)**: Depends structurally on US1 existing (a widget needs a dashboard) but is independently specified/testable once US1's create flow exists.
- **US3 (Dashboard Layout, P1)**: Depends structurally on US2 (needs at least one widget to arrange) but is independently specified/testable.
- **US4 (Live Analytics, P1)**: Depends structurally on US2 (needs data-driven widgets to exist) but is independently specified/testable.
- **US5 (Reporting, P2)**: Benefits from a populated dashboard (US1–US4) existing, but its own services/endpoints/components are built independently.
- **US6 (Filtering, P2)**: Benefits from data-driven widgets (US2/US4) existing, but its own repository/endpoints/UI are independent.
- **US7 (Sharing, P2)**: No dependency on other stories beyond US1 (needs a dashboard to share).
- **US8 (Templates, P3)**: Depends structurally on US2's widget types existing (a template's blueprint references real widget types) but is independently specified/testable.
- **US9 (Export, P3)**: Benefits from widgets/reports existing, but its own service/components are independent.
- **US10 (Administration, P3)**: Benefits from US1–US9 having produced real dashboards/activity to administer, but its own repository queries/UI are independent.

### Within Each Phase

- Foundational/infrastructure tasks before story-specific tasks (Phases 1–7 before 8–16).
- Repository/service confirmation before UI wiring within each user-story phase.
- Component implementation before its own tests.
- Story complete (checkpoint passes) before considering that story done.

### Parallel Opportunities

- All `[P]`-marked tasks within a phase touch different files (or are read-only verification tasks) and have no unresolved dependency on an incomplete task in the same phase.
- Phases 12 (Sharing), 13 (Templates), 14 (Filters) can be staffed and built fully in parallel once Phase 10 completes.
- Phase 15 (Export) can start its service-layer work in parallel with 11–14, though its full integration test benefits from Phase 11's report-download pattern existing first (T269's reuse confirmation).
- Phase 16 (UI Components)'s Administration section (T284–T288, US10) can be built in parallel with its integration-polish section (T275–T283) once Phases 8–10 exist, since Administration only reads existing data (dashboards/activity/analytics), never depends on the polish work itself.

---

## Parallel Example: Phase 10 (Analytics Widgets)

```bash
# Once Phase 9 completes, these Phase 10 tasks can run in parallel (different files):
Task: "T171 [US2] Map Widget component"
Task: "T173 [US2] Metric Card widget"
Task: "T175 [US2] Statistics Widget"
Task: "T177 [US2] Table Widget"
Task: "T179 [US2] Chart Widget shared wrapper"
Task: "T184 [US2] Gauge Widget"
Task: "T186 [US2] Text Widget"
Task: "T187 [US2] Image Widget"
Task: "T188 [US2] HTML Widget"

# Once T179 (shared chart wrapper) exists, these four variants run in parallel:
Task: "T180 [US2] Pie Chart variant"
Task: "T181 [US2] Bar Chart variant"
Task: "T182 [US2] Line Chart variant"
Task: "T183 [US2] Area Chart variant"
```

## Parallel Example: Phases 12–14 (Sharing, Templates, Filters)

```bash
# Once Phase 10 completes, three teams/agents can work these phases fully in parallel:
Team A: Phase 12 (T215–T230, Sharing)
Team B: Phase 13 (T231–T245, Templates)
Team C: Phase 14 (T246–T260, Filters)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phases 1–7 (Foundation → Stores) — the shared platform every story needs.
2. Complete Phase 8 (US1, Dashboard Builder).
3. **STOP and VALIDATE**: run quickstart.md §1 manually; confirm T145's checkpoint is green.
4. Deploy/demo if ready — dashboard CRUD alone, with an empty-state Toolbox, is a legitimate MVP slice per spec.md's own US1 priority framing.

### Incremental Delivery

1. Phases 1–7 → platform ready.
2. Phase 8 (US1) → test independently → deploy/demo (MVP).
3. Phase 9 (US2/US3 mechanics) + Phase 10 (US2/US4 widget types) → test independently → deploy/demo (a genuinely useful dashboard builder now exists).
4. Phase 11 (US5, Reporting) → test independently → deploy/demo.
5. Phases 12–14 (US7 Sharing, US8 Templates, US6 Filtering) → test independently, in parallel → deploy/demo.
6. Phase 15 (US9, Export) → test independently → deploy/demo.
7. Phase 16 (US10 Administration + full UI integration) → test independently → deploy/demo.
8. Phases 17–20 (Performance/Accessibility/Testing/Docs) → final hardening pass → ship.

### Parallel Team Strategy

With multiple developers/agents:

1. Team completes Phases 1–7 together (Foundation is inherently sequential/shared).
2. Phases 8→9→10 are sequenced together (build-order dependency, see Phase Dependencies note) — best kept as one team/agent's continuous stream rather than split.
3. Once Phase 10 is done:
   - Developer/Agent A: Phase 11 (US5)
   - Developer/Agent B: Phase 12 (US7)
   - Developer/Agent C: Phase 13 (US8)
   - Developer/Agent D: Phase 14 (US6)
   - Developer/Agent E: Phase 15 (US9), building service-layer work ahead of Phase 11 landing where possible
4. One developer/agent builds Phase 16's Administration section (T284–T288) once Phase 10 exists, in parallel with the integration-polish section, then the whole team converges for final integration.
5. Phases 17–20 run as a shared final pass once Phase 16 is integrated.

---

## Notes

- `[P]` tasks touch different files (or are read-only verification/audit tasks) with no unresolved same-phase dependency.
- `[US#]` labels map every Phase 8–16 task to its spec.md user story for traceability; Phases 1–7 and 17–20 carry no story label (cross-cutting). Several phases (8, 9, 10, 16) mix story labels within one phase where the roadmap outline's theme-based phase name doesn't align 1:1 with spec.md's story boundaries — each task's label reflects the story it factually belongs to.
- Per the Architecture note at the top of this file: several concepts named in the originally-requested phase outline ("WidgetConfiguration," "TemplateRepository," "FavoriteRepository," "AnalyticsStore," "ReportStore," "ExportStore," "Import template," "Export template") are implemented as fields/functions on the approved, already-designed schema and the two approved stores, or are explicitly confirmed out of scope per data-model.md — never as additional tables, files, or stores invented to match a name in the outline. Every task above says explicitly which real artifact (or explicit non-implementation) a named concept maps to.
- Every acceptance criterion above cites a spec.md `FR-`/`SC-`/Acceptance-Scenario id it satisfies, so traceability back to spec.md is auditable task-by-task.
- Commit after each task or logical group; stop at any checkpoint to validate a phase/story independently before continuing.
- Avoid: vague tasks, same-file conflicts on `[P]`-marked tasks, and cross-story dependencies that would break a story's independent testability beyond the one documented, unavoidable build-order coupling in Phases 8→9→10.

