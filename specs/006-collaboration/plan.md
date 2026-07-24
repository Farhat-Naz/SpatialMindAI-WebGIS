# Implementation Plan: Real-Time Collaboration

**Branch**: `006-collaboration` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-collaboration/spec.md`

---

## Summary

This plan covers the complete `006-collaboration` spec: all nine user
stories (Project Sharing, Real-Time Collaboration, Feature Locking,
Activity History, Version History, Comments, Notifications, Offline
Editing, Presence). Three findings shape this plan significantly:

1. **This is the first feature to require live, multi-instance server →
   client push.** No prior feature needed one. Rather than introducing a
   new WebSocket server process or a third-party realtime service, this
   plan reuses the existing single Next.js app and the existing Postgres
   instance: **Server-Sent Events** for transport and **PostgreSQL
   `LISTEN`/`NOTIFY`** for cross-instance fan-out (research.md Decisions
   1–2) — zero new infrastructure, portable across Vercel/Railway/
   Docker/AWS identically.
2. **This is the first feature to require multi-user access to a single
   Project.** The existing single-owner ownership-scoping pattern
   (`getProjectById`, `getLayerScopedToOwner`, `getFeatureScopedToOwner`)
   necessarily broadens to recognize `ProjectMember` rows, not just
   `Project.ownerId` — a narrow, explicit, and unavoidable modification to
   existing code (research.md Decision 10), not a redesign: every
   function's signature and every caller are unchanged.
3. **Eight new Prisma models, zero new architecture layers.** Every new
   capability (membership, invitations, comments, activity, versions,
   notifications, locks, presence) is a normal Prisma model with a normal
   repository file, following the exact same shape 003/004/005 already
   established.

---

## Technical Context

**Language/Version**: TypeScript 5 (strict mode — unchanged)

**Primary Dependencies**:
- next@16, react@19/react-dom@19, @tanstack/react-query@5, zustand@5,
  zod, shadcn/ui (all existing — reused)
- **`pg` (`node-postgres`)** — new, minimal — the one dependency this
  feature adds, needed solely for a dedicated `LISTEN`/`NOTIFY` connection
  Prisma Client cannot provide (research.md Decision 2). No other new
  npm dependency (no WebSocket library, no realtime SaaS SDK, no rich-
  text editor, no IndexedDB wrapper library — the native browser API is
  used directly, research.md Decision 6).
- Native browser `EventSource` (client-side realtime) and native
  `indexedDB` (client-side offline queue) — both platform APIs, not npm
  packages.

**Storage**: Eight new Prisma models (`ProjectMember`, `Invitation`,
`Comment`, `Activity`, `Version`, `Notification`, `FeatureLock`,
`Presence` — data-model.md) plus additive back-relations on `Project`,
`Feature`, `User`. One migration. `featureRepository.ts`'s
`updateFeature`/`deleteFeature` gain a lock/conflict guard clause each
(research.md Decisions 4–5) — their signatures and every caller are
unchanged.

**Testing**: Vitest + React Testing Library (unchanged), extended with a
new tier this feature specifically requires: SSE/realtime tests (mocking
`EventSource`/`pg_notify` rather than requiring a live second connection
in every test). API tests against the real PostGIS test database,
skip-if-unavailable, unchanged pattern.

**Target Platform**: Unchanged Node.js runtime; this plan explicitly
targets portability across Vercel, Railway, Docker, and AWS (Deployment
section) — a first for this project's features, driving Decision 1's
SSE-over-WebSocket choice specifically.

**Project Type**: Web application. Adds one new top-level client feature
module, `src/features/collaboration/` (same internal shape as every
existing feature module), roughly a dozen new Route Handlers, eight new
repository files, and two small new server-only modules
(`src/server/realtime/channel.ts`, `src/server/auth/assertProjectRole.ts`).

**Performance Goals** (from spec Success Criteria, plus this plan's
explicit targets):
- SC-002: a change is visible to other active members within 5 s.
- SC-006: presence disappears within 30 s of a genuine disconnect.
- This plan's stated scale target: **100 concurrent editors**, **50,000
  features** (single project), **100 projects** — see Performance section.

**Constraints**:
- No background job/cron infrastructure exists or is introduced; presence
  and lock expiry are both checked at read time (research.md Decisions
  3–4), not via a scheduled worker.
- Offline conflict resolution is never automatic/silent (spec
  Assumptions) — every conflict is surfaced, never last-write-wins.
- Notification delivery is in-app only this iteration (spec Assumptions)
  — no email/push integration.
- Authentication itself is out of scope (spec) — this feature consumes
  the existing `getCurrentUser` seam exactly as-is.

**Scale/Scope**: Eight new Prisma models, one migration, ~21 new Route
Handlers, eight new repository files, two new server-only modules, one
new client feature module with its own store/services/hooks, and a
narrowly-scoped, explicitly-justified modification to two existing
repository functions and three existing ownership-scoping helpers'
internal query logic (signatures unchanged).

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1
design — see bottom of this section.*

| Principle | Check | Notes |
|---|---|---|
| I. Architecture (Feature-First) | ✅ PASS | New client code lives in a new `src/features/collaboration/` module with its own barrel; new Route Handlers live under `app/api/`; only the new repository files plus one new realtime module import `@prisma/client`/`pg` — matching 003's already-accepted repository-layer interpretation |
| II. Type Safety | ✅ PASS | Every new endpoint has a Zod schema; the two modified existing endpoints (`PATCH`/`DELETE` feature) gain one additive optional field, not a breaking shape change |
| III. Database | ⚠️ PASS WITH NOTED EXTENSION | Eight new models via one migration; `Project`/`Feature`/`User` gain additive back-relations only; **the one real exception** is `featureRepository.ts`'s two functions gaining a guard clause and three ownership-scoping helpers broadening their `WHERE` clause — necessary because multi-user access is this feature's entire premise, explicitly justified in research.md Decision 10 and Complexity Tracking below, not an unexamined deviation |
| IV. GIS Principles | ✅ PASS | No new spatial calculation is introduced by this feature at all — it adds collaboration metadata around existing, already-PostGIS-validated geometry; `Version.snapshot` stores already-serialized GeoJSON, computed nowhere new |
| V. Performance | ✅ PASS | Every new list is cursor-paginated (activity_created_at-style indexes throughout, data-model.md); the one new dependency (`pg`) is server-only, zero client bundle impact; presence/lock cleanup is read-time-checked, not a new polling loop |
| VI. Security | ✅ PASS | Every new endpoint follows the identical auth → rate-limit → validate → scoped-repository-call → error-map shape; the broadened ownership check and the new `assertProjectRole` layer are both enforced server-side, never client-only (research.md Decision 10) |
| VII. Testing | ✅ PASS | Unit/store/hook/API/integration/performance/accessibility tiers planned for every user story, plus a new realtime-specific test tier (Testing Strategy) |
| VIII. Documentation | ✅ PASS | spec→plan→(tasks→implementation→tests→docs) lifecycle in progress; JSDoc required on every new exported function |
| IX. Git Workflow | ✅ PASS (process) | Standard workflow applies |
| X. Quality Gates | ✅ PASS | TypeScript, ESLint, tests, `next build` all gate merge; `pg`'s bundle impact is server-only (no client bundle-analyzer concern) |

**One noted, justified extension — not a violation**: Principle III/I's
"only Route Handlers/repositories touch the database" and "don't
redesign" are both honored (the modification lives entirely inside the
existing repository layer, in the same functions, calling the same
patterns) — see Complexity Tracking for the formal justification.

**Re-check after Phase 1 design**: Confirmed still PASS-with-noted-
extension. `data-model.md` and `contracts/` confirm the scope is exactly
eight new models, ~21 new endpoints, and the one documented existing-code
touch-point — nothing broader emerged during design.

---

## Project Structure

### Documentation (this feature)

```text
specs/006-collaboration/
├── spec.md                # Approved
├── plan.md                # This file
├── research.md            # Phase 0 output (12 decisions)
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/
│   ├── api-contracts.md
│   ├── repository-api.md
│   └── client-api.md
├── checklists/
│   └── requirements.md
└── tasks.md                # Generated by /speckit-tasks (NOT this command)
```

### Source Code (repository root) — additions only

```text
prisma/
└── schema.prisma                          # MODIFIED: + 8 models, + back-relations on Project/Feature/User

src/
├── server/
│   ├── repositories/
│   │   ├── featureRepository.ts           # MODIFIED: + lock/conflict guard in updateFeature/deleteFeature
│   │   ├── projectRepository.ts           # MODIFIED: getProjectById's WHERE broadened (membership-aware)
│   │   ├── layerRepository.ts             # MODIFIED: getLayerScopedToOwner's WHERE broadened
│   │   ├── membershipRepository.ts        # NEW
│   │   ├── invitationRepository.ts        # NEW
│   │   ├── commentRepository.ts           # NEW
│   │   ├── activityRepository.ts          # NEW
│   │   ├── versionRepository.ts           # NEW
│   │   ├── notificationRepository.ts      # NEW
│   │   ├── featureLockRepository.ts       # NEW
│   │   └── presenceRepository.ts          # NEW
│   ├── realtime/
│   │   └── channel.ts                     # NEW — the only file holding a raw `pg` LISTEN connection
│   └── auth/
│       └── assertProjectRole.ts           # NEW
│
├── shared/
│   ├── errors/
│   │   └── apiError.ts                    # MODIFIED: + ForbiddenError (403), + ConflictError (409)
│   └── contracts/
│       ├── membership.schema.ts           # NEW
│       ├── invitation.schema.ts           # NEW
│       ├── comment.schema.ts              # NEW
│       ├── version.schema.ts              # NEW
│       ├── notification.schema.ts         # NEW
│       ├── presence.schema.ts             # NEW
│       └── lock.schema.ts                 # NEW
│
└── features/
    └── collaboration/                     # NEW top-level feature module
        ├── components/
        │   ├── MemberList.tsx             # NEW (US1)
        │   ├── InviteDialog.tsx           # NEW (US1)
        │   ├── PresenceIndicator.tsx      # NEW (US2/US9)
        │   ├── LockBadge.tsx              # NEW (US3)
        │   ├── ActivityTimeline.tsx       # NEW (US4)
        │   ├── VersionHistoryPanel.tsx    # NEW (US5)
        │   ├── VersionCompareView.tsx     # NEW (US5)
        │   ├── CommentThread.tsx          # NEW (US6)
        │   ├── NotificationBell.tsx       # NEW (US7)
        │   ├── NotificationList.tsx       # NEW (US7)
        │   ├── OfflineStatusBanner.tsx    # NEW (US8)
        │   └── ConflictResolutionDialog.tsx # NEW (US3/US8)
        ├── hooks/                         # useMembers, useInvitations, useComments, useActivity,
        │                                  # useVersions, useNotifications, useFeatureLock, usePresence,
        │                                  # useOfflineQueue (client-api.md)
        ├── services/                      # 8 services + queryKeys.ts + realtimeClient.ts + offlineQueue.ts
        ├── store/
        │   └── collaborationStore.ts      # NEW: activePresence/activeLocks/connectionStatus/unreadCount
        ├── types/
        │   └── collaboration.types.ts     # NEW
        ├── index.ts                       # NEW — public barrel
        └── __tests__/

app/
└── api/
    ├── projects/[projectId]/
    │   ├── invitations/route.ts           # NEW: POST, GET
    │   ├── members/route.ts               # NEW: GET
    │   ├── members/[userId]/route.ts      # NEW: PATCH, DELETE
    │   ├── transfer-ownership/route.ts    # NEW: POST
    │   ├── activity/route.ts              # NEW: GET
    │   ├── versions/route.ts              # NEW: POST, GET
    │   ├── presence/route.ts              # NEW: GET
    │   ├── presence/heartbeat/route.ts    # NEW: POST
    │   └── stream/route.ts                # NEW: GET (SSE)
    ├── invitations/[invitationId]/
    │   ├── accept/route.ts                # NEW: POST
    │   └── decline/route.ts               # NEW: POST
    ├── versions/
    │   ├── [versionId]/route.ts           # NEW: GET
    │   ├── [versionId]/restore/route.ts   # NEW: POST
    │   └── compare/route.ts               # NEW: GET
    ├── features/[featureId]/
    │   ├── comments/route.ts              # NEW: GET, POST
    │   └── lock/route.ts                  # NEW: POST, DELETE
    ├── comments/[commentId]/route.ts      # NEW: PATCH, DELETE
    └── notifications/
        ├── route.ts                        # NEW: GET
        ├── [notificationId]/read/route.ts  # NEW: PATCH
        └── mark-all-read/route.ts          # NEW: POST
```

**Structure Decision**: A new top-level feature module
(`src/features/collaboration/`) is introduced, for the same reason
005's `analysis` module was — it is a genuinely new concern (multi-user
coordination, not project data itself), consuming `database`'s barrel
rather than being folded into it. The touch-points inside
`src/server/repositories/{feature,project,layer}Repository.ts` are the
narrowest possible surface for multi-user access to become possible at
all through the *existing* endpoints those repositories already back —
every alternative considered (research.md Decision 10) required a larger,
riskier surface (a parallel API, or client-only enforcement).

---

## Architecture

### Repository Layer

Eight new files (contracts/repository-api.md) following
`featureRepository.ts`'s exact conventions: ownership/role-scoped reads,
`$transaction`-wrapped writes, `NotFoundError`/`ForbiddenError`/
`ConflictError` thrown, never caught and swallowed. `recordActivity`/
`createNotification` are the two exceptions to "one function, one
concern" — they take an **existing** transaction client as their first
argument specifically so every other repository function can write an
`Activity`/`Notification` row inside its own transaction (research.md
Decisions 8–9), never as a bolt-on afterthought.

### Service Layer (client)

Eight new `src/features/collaboration/services/*.ts` files, each a thin
`apiFetch` wrapper — zero business logic, matching Constitution Principle
I exactly. `realtimeClient.ts` and `offlineQueue.ts` are the two
exceptions with real client-side logic (event dispatch, queue
persistence) — both are still client-only, calling the same service
layer/mutation hooks for actual server communication, never bypassing
them.

### Route Handlers

~21 new handlers (contracts/api-contracts.md), every one following
`getCurrentUser` → `assertWriteRateLimit`/`assertProjectRole` →
Zod-parse → repository call → `handleRouteError`. The SSE stream handler
(`GET /api/projects/:projectId/stream`) is the one structurally different
handler — it returns a `ReadableStream` response instead of a JSON body,
registers a `subscribe` callback (repository-api.md) on open, and
unregisters it when the client disconnects.

### Real-Time (SSE) Architecture

```text
Client A                    Server instance (any of N)              Postgres
--------                    --------------------------              --------
EventSource ──GET /stream──▶ subscribe(projectId channel) ──LISTEN──▶ (idle)
                             │
Client B                    │
POST /features/:id  ───────▶ repository write + publish() ──NOTIFY──▶ (fan-out)
                             │
                             ◀── notification delivered to every instance's LISTEN connection
                             │
EventSource (A) ◀──event────┘ (the instance holding A's stream writes the SSE event)
```

Each server instance holds exactly one dedicated `pg` `LISTEN`
connection (research.md Decision 2) fanning out to every open SSE
response it is personally serving — this is what makes the architecture
horizontally scalable across N instances without a sticky-session
requirement: a write on instance 1 reaches a client connected to instance
2 via Postgres, not via any direct instance-to-instance link.

### React Query Flow

`collaboration`'s own `queryKeys.ts` centralizes every new list/detail
key (client-api.md), following 005's already-corrected pattern (never an
inline literal, T113 precedent). Mutations invalidate their own resource's
key on success; incoming realtime events for a resource with a React
Query-cached list (comments, members, notifications) trigger the same
invalidation a mutation's own `onSuccess` would — realtime and
self-mutation both converge on one cache-invalidation path, not two
parallel ones.

### Zustand Flow

`collaborationStore` (client-api.md) holds only the state that doesn't
belong in a request/response cache at all — live presence, live lock
state, connection status, and a live-updated unread count mirror. It
never duplicates `database`'s `databaseStore`/`editingStore` or
`analysis`'s `analysisStore`.

### Component Hierarchy

```text
DashboardLayout (existing, 001-app-foundation)
├── RightSidebar (existing, 004-map-editing-ui)
│   └── MemberList / InviteDialog / ActivityTimeline / VersionHistoryPanel /
│       NotificationBell+NotificationList  (NEW — added as additional
│       RightSidebar sections, alongside the existing LayerTree)
└── MapCore (existing, 001-app-foundation)
    └── MapEditingLayer (existing, 004-map-editing-ui)
        ├── PresenceIndicator / LockBadge / CommentThread   (NEW — rendered
        │   per-feature/per-cursor, same overlay pattern as
        │   FeatureContextMenu)
        ├── OfflineStatusBanner                              (NEW — same
        │   overlay corner as EditingErrorBanner)
        └── ConflictResolutionDialog                         (NEW — modal,
            triggered by a 409 from either the lock or offline-sync path)
```

---

## Database

See `data-model.md` for full field/relationship/index/cascade detail on
all eight new models. Summary: `ProjectMember` + `Invitation` (US1),
`Comment` (US6), `Activity` (US4), `Version` (US5), `Notification` (US7),
`FeatureLock` (US3), `Presence` (US9) — one migration, additive
back-relations only on `Project`/`Feature`/`User`.

## Contracts

See `contracts/api-contracts.md` (21 new endpoints across 8 resource
areas + the SSE stream + the two extended existing endpoints),
`repository-api.md` (server layer), and `client-api.md` (services/hooks/
store/realtime/offline-queue).

---

## Testing Strategy

| Tier | Coverage |
|---|---|
| **Unit** | Every new Zod schema (membership/invitation/comment/version/notification/presence/lock); `@mention` parsing; version-diff comparison logic; lock/presence expiry-check logic |
| **Store** | `collaborationStore` — presence/lock/connection-status/unread-count updates from simulated realtime events |
| **Hook** | Every new hook against a mocked service layer; `useOfflineQueue` against a mocked IndexedDB and mocked `online`/`offline` events |
| **API** | Every new Route Handler against the real test database (skip-if-unavailable): success, role-insufficient (`403`), cross-member (`404`), conflict (`409`) paths per endpoint |
| **WebSocket/SSE** | A dedicated tier: the SSE Route Handler tested by opening a `ReadableStream` response and asserting the correct event is written after a `publish()` call; `EventSource`-consuming client code tested via a mocked `EventSource` (jsdom has no native SSE client, matching how this project already mocks browser-only APIs elsewhere) |
| **Component** | Every new component in `src/features/collaboration/components/` |
| **Integration** | Full per-story flows mirroring `quickstart.md`'s sections — invite→access, live two-session update, lock→conflict→release, comment→mention→notification, offline→reconnect→conflict, version save→restore |
| **Performance** | Simulated 100-concurrent-SSE-connection load test; 50,000-feature project's Activity/Version/Comment list pagination timing |
| **Accessibility** | Every new interactive component checked against WCAG 2.2 AA, per Constitution's Additional Standards |
| **End-to-end** | The full `quickstart.md` walkthrough, run manually (or via a browser-automation pass) as the final acceptance gate before this feature is considered done |

---

## Performance

- **100 concurrent editors**: bounded by open SSE connections per server
  instance — within normal Node.js concurrent-connection capacity; N
  instances scale linearly since fan-out is via Postgres `NOTIFY`, not an
  in-memory broadcast requiring sticky sessions (research.md Decision 2).
- **50,000 features** (single project): `Version.snapshot`'s JSON size at
  this scale is the main cost driver — mitigated by only ever reading a
  full snapshot on an explicit save/restore/compare action, never on a
  routine list view (`listVersionsForProject` returns metadata only, per
  `api-contracts.md`).
- **100 projects**: each project's SSE stream and `LISTEN` channel are
  independent; no cross-project fan-out cost.
- Every new list (Activity, Comments, Notifications, Versions) is cursor-
  paginated identically to `003-database-foundation`'s established
  pattern — confirmed adequate for the stated scale in the Performance
  test tier above.

## Security

- **Authorization**: every write checked by the broadened ownership scope
  (research.md Decision 10) plus `assertProjectRole` where a role
  distinction applies (Owner-only membership actions; Editor-or-above
  data writes).
- **Ownership**: `Project.ownerId` remains the single source of truth for
  "who is Owner," kept in sync with the corresponding `ProjectMember` row
  on every transfer (data-model.md).
- **Role permissions**: Owner/Editor/Viewer enforced identically across
  every new and existing write endpoint touched by this feature — no
  endpoint left checking ownership only where a role distinction matters.
- **Input validation**: every new endpoint Zod-validates its body/query
  before any repository call, per Constitution Principle II, with no
  exception.
- **Rate limiting**: a new `collaboration:write` bucket applied to every
  new write endpoint, via the existing `assertWriteRateLimit` mechanism —
  no new rate-limiting infrastructure.
- **Audit logging**: `Activity` (FR-047) is this feature's audit log —
  append-only, immutable, attribution preserved even against a
  (hypothetical) future user-deletion capability (data-model.md).

## Deployment

- **Vercel**: SSE responses require Fluid Compute (long-lived Node.js
  execution) rather than the traditional short-lived Function model —
  confirm the deployment's Function configuration allows a long-running
  streamed response; the `pg` `LISTEN` connection must be held per warm
  instance, not re-established per request.
- **Railway**: a persistent Node process is Railway's default deployment
  model — SSE and the dedicated `LISTEN` connection work with no special
  configuration.
- **Docker**: same as Railway — a long-running container process is the
  natural fit; ensure the container's Postgres connection limit
  accommodates one extra long-lived connection per container beyond
  Prisma's own pool.
- **AWS**: if deployed as a persistent process (ECS/EC2), identical to
  Railway/Docker; if deployed as Lambda-backed (e.g., via a serverless
  Next.js adapter), the same SSE/long-lived-connection caveat as Vercel
  applies — a Lambda-per-request model cannot hold an open SSE stream or
  a standing `LISTEN` connection across invocations, and would need a
  dedicated always-on component for the realtime layer specifically.
- **Common to all four**: only one dedicated `LISTEN` connection is
  needed *per warm server instance*, not per client — confirm each
  target's Postgres max-connections setting accounts for
  (warm instances × 1) additional connections beyond Prisma's existing
  pool.

## Risks

| Risk | Mitigation |
|---|---|
| A Lambda-per-invocation deployment (serverless AWS, or a future Vercel configuration without Fluid Compute) cannot hold an open SSE stream or standing `LISTEN` connection | Documented explicitly in Deployment; the fallback for such a target is a short-poll (React Query `refetchInterval`) degrading gracefully in place of true push — not implemented in this plan's default path, called out as a follow-up if that deployment target is chosen |
| Broadening `getProjectById`/`getLayerScopedToOwner`/`getFeatureScopedToOwner`'s `WHERE` clause touches code every existing feature (003/004/005) depends on | Mitigated by the change being additive-only at the SQL level (widening an `OR`, never narrowing the existing owner-only case) and by re-running 003/004/005's full existing test suites unmodified as part of this feature's own quality gate — a regression would be caught immediately, not discovered later |
| `pg`'s dedicated `LISTEN` connection per instance is a new operational dependency this project hasn't had to reason about before (a dropped `LISTEN` connection needs its own reconnect logic, separate from a client's `EventSource` reconnect) | `channel.ts` (repository-api.md) owns a small reconnect-with-backoff loop for its own server-side `LISTEN` connection, independent of and in addition to the client's `EventSource` auto-reconnect |
| No existing seeded second user for realistic multi-user testing (003's `DEV_USER_ID` seam assumes one user) | `quickstart.md`'s Prerequisites call for seeding a second test user id explicitly; this is a test-fixture concern, not a product gap, since real multi-user identity resolution is out of scope (spec) |
| 100-concurrent-SSE-connection and 50,000-feature performance targets are asserted in this plan but not yet measured against a real deployment | Performance test tier (Testing Strategy) explicitly budgets a load-test task before this feature is considered done — treated as a verification gap to close in implementation, not an assumed pass |

---

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `featureRepository.ts`'s `updateFeature`/`deleteFeature` gain a guard clause; `getProjectById`/`getLayerScopedToOwner`/`getFeatureScopedToOwner`'s `WHERE` clauses broaden to recognize `ProjectMember` | Multi-user project access (US1) is this feature's entire premise — without this, an invited Editor/Viewer cannot use any existing feature/layer endpoint at all, making the whole spec undeliverable through the existing architecture | A parallel, collaboration-aware set of feature/layer endpoints (rejected, research.md Decision 10 — two divergent code paths for the same action is a larger, riskier surface than one broadened check, and would itself be closer to "redesigning" than extending the existing one) |
