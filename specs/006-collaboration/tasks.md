---

description: "Task list for feature implementation"
---

# Tasks: Real-Time Collaboration

**Input**: Design documents from `specs/006-collaboration/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/, quickstart.md (all present)

**Tests**: Explicitly requested — unit, API, hook, store, WebSocket/SSE,
integration, performance, and accessibility tiers are all included.

**Organization**: Per the user's explicit request, tasks are organized
into the 20 named phases below (Foundation → Documentation) rather than
strictly one phase per user story — phases 1–8 build the full backend +
realtime + client-state layer shared by every story; phases 9–15 deliver
each user story's UI one at a time (still independently testable);
phases 16–20 are cross-cutting polish. Every phase ends with a
Checkpoint task.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency)
- **[Story]**: US1–US9 for phases 9–15 (per-story UI); phases 1–8 and
  16–20 carry no story label (shared infrastructure/cross-cutting)

---

## Phase 1 — Foundation

**Purpose**: Environment, configuration, shared types, constants,
utilities, rate limiting, and realtime-channel configuration every later
phase depends on.

- [X] T001 Add the `pg` (`node-postgres`) dependency
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `package.json`
  - **Goal**: Add `pg` and `@types/pg` — the one new dependency this
    feature introduces (research.md Decision 2), needed solely for the
    dedicated `LISTEN`/`NOTIFY` connection Prisma Client cannot provide.
  - **Acceptance Criteria**: `npm install` succeeds; no other dependency
    changes.
  - **Verification**: `npm ls pg`
  - **Dependencies**: None

- [X] T002 [P] Add `ForbiddenError`/`ConflictError` to the shared error taxonomy
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/errors/apiError.ts`
  - **Goal**: Two new error classes + `ApiErrorCode` entries —
    `ForbiddenError` → `403 FORBIDDEN` (insufficient role, research.md
    Decision 10), `ConflictError` → `409 CONFLICT` (lock/version
    conflict, Decisions 4–5) — following the exact existing class shape
    (`NotFoundError`, `ValidationError`, etc.) additively.
  - **Acceptance Criteria**: `handleRouteError` maps both without any
    other error class's mapping changing.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T003 [P] Add the `collaboration:write` rate-limit bucket
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/security/rateLimiter.ts` (or equivalent
    existing bucket-registration point)
  - **Goal**: Register a new bucket name used by every write endpoint in
    this feature via the existing `assertWriteRateLimit` mechanism — no
    new rate-limiting infrastructure.
  - **Acceptance Criteria**: `assertWriteRateLimit(userId,
    "collaboration:write")` behaves identically to every existing bucket.
  - **Verification**: Covered by Phase 4's API tests.
  - **Dependencies**: None

- [X] T004 [P] Scaffold `src/features/collaboration/` module structure
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/{components,hooks,services,store,types,__tests__}/`, `index.ts` (placeholder)
  - **Goal**: Empty directory structure matching every existing feature
    module's shape (plan.md Structure Decision).
  - **Acceptance Criteria**: Directories exist; barrel compiles empty.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T005 [P] `src/shared/contracts/membership.schema.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/membership.schema.ts`
  - **Goal**: Zod schemas for invite (`{invitedUserId, role}`), change-role
    (`{role}`), transfer-ownership (`{newOwnerUserId}`) request bodies.
  - **Acceptance Criteria**: `role` restricted to `"Editor" | "Viewer"`
    for invite/change-role (never `"Owner"` — transfer is separate, per
    data-model.md).
  - **Verification**: Covered by T060's unit test.
  - **Dependencies**: None

- [X] T006 [P] `src/shared/contracts/invitation.schema.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/invitation.schema.ts`
  - **Goal**: Schema for the `Invitation` response shape (id, projectId,
    invitedByUserId, invitedUserId, role, status, timestamps).
  - **Acceptance Criteria**: `status` restricted to the four documented
    values (data-model.md).
  - **Verification**: Covered by T060.
  - **Dependencies**: None

- [X] T007 [P] `src/shared/contracts/comment.schema.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/comment.schema.ts`
  - **Goal**: Schemas for create (`{body, parentCommentId?}`) and update
    (`{body?, resolved?}`) request bodies, and the `Comment` response
    shape including `mentionedUserIds`.
  - **Acceptance Criteria**: `body` non-empty; `parentCommentId` optional
    string.
  - **Verification**: Covered by T060.
  - **Dependencies**: None

- [X] T008 [P] `src/shared/contracts/version.schema.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/version.schema.ts`
  - **Goal**: Schemas for save (`{note?}`) request body and the `Version`
    metadata/detail response shapes (metadata excludes `snapshot`, detail
    includes it — matching `api-contracts.md`).
  - **Acceptance Criteria**: Both shapes covered as distinct schemas.
  - **Verification**: Covered by T060.
  - **Dependencies**: None

- [X] T009 [P] `src/shared/contracts/notification.schema.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/notification.schema.ts`
  - **Goal**: `Notification` response shape schema; `type` restricted to
    the seven documented values (FR-036).
  - **Acceptance Criteria**: All seven types covered.
  - **Verification**: Covered by T060.
  - **Dependencies**: None

- [X] T010 [P] `src/shared/contracts/presence.schema.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/presence.schema.ts`
  - **Goal**: Schema for the heartbeat request body (`{cursor?,
    viewportBounds?, currentFeatureId?}`) and the `Presence` response
    shape.
  - **Acceptance Criteria**: All fields optional except the implicit
    caller identity.
  - **Verification**: Covered by T060.
  - **Dependencies**: None

- [X] T011 [P] `src/shared/contracts/lock.schema.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/lock.schema.ts`
  - **Goal**: `FeatureLock` response shape schema (featureId,
    lockedByUserId, acquiredAt, expiresAt).
  - **Acceptance Criteria**: Matches data-model.md exactly.
  - **Verification**: Covered by T060.
  - **Dependencies**: None

- [X] T012 `src/server/auth/assertProjectRole.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/auth/assertProjectRole.ts`
  - **Goal**: `assertProjectRole(projectId, userId, minRole)` — throws
    `ForbiddenError` if the caller's role is below `minRole`,
    `NotFoundError` if they have no access at all (research.md Decision
    10). Reads via the (not-yet-broadened) `ProjectMember` table directly
    for now; re-verified once Phase 2/3 land.
  - **Acceptance Criteria**: Role ordering `Viewer < Editor < Owner`
    enforced correctly for all three `minRole` values.
  - **Verification**: Covered by T042's regression test once
    `ProjectMember` exists (Phase 2/3).
  - **Dependencies**: T002

- [X] T013 `src/server/realtime/channel.ts` — skeleton
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/realtime/channel.ts`
  - **Goal**: `publish(channel, event)` and `subscribe(channel, onEvent)`
    exports over a single dedicated `pg` client per process (research.md
    Decision 2) — **Server-Sent Events, not WebSocket** (Decision 1); the
    skeleton establishes the connection and the publish/subscribe
    surface; reconnect-with-backoff logic is completed in Phase 8 (T106)
    once there is a realistic event flow to test it against.
  - **Acceptance Criteria**: `publish`/`subscribe` compile and connect
    against a configured `DATABASE_URL`; no other file yet calls them.
  - **Verification**: `npx tsc --noEmit`; manual connectivity check
    (skip cleanly if no live database — same convention as every DB-
    dependent check this session).
  - **Dependencies**: T001

- [X] T014 [P] `src/features/collaboration/types/collaboration.types.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/types/collaboration.types.ts`
  - **Goal**: Re-export every schema module's inferred types (T005–T011),
    matching every existing feature's re-export pattern.
  - **Acceptance Criteria**: No type hand-duplicated from a schema module.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T005, T006, T007, T008, T009, T010, T011

- [X] T015 **Checkpoint** — Foundation quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the shared error/rate-limit/schema/realtime-skeleton
    layer is sound before any repository work begins.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; unit tests
    for T002/T005–T011 pass; `next build` succeeds; no documentation gap
    yet expected at this phase.
  - **Verification**: Commands run clean.
  - **Dependencies**: T001–T014

---

## Phase 2 — Database

**Purpose**: The eight new Prisma models, one migration, and the seed
update `quickstart.md` requires for multi-user testing.

- [X] T016 Add eight new models + back-relations to `prisma/schema.prisma`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma`
  - **Goal**: `ProjectMember`, `Invitation`, `Comment`, `Activity`,
    `Version`, `Notification`, `FeatureLock`, `Presence` exactly as
    specified in data-model.md, plus additive back-relations on
    `Project`/`Feature`/`User`. No existing field/index/cascade changes.
  - **Acceptance Criteria**: `npx prisma validate` passes; every field,
    index, and cascade rule matches data-model.md exactly (including the
    `Restrict`-vs-`Cascade` distinction between attribution and
    membership rows).
  - **Verification**: `npx prisma validate`
  - **Dependencies**: None

- [X] T017 Regenerate the Prisma Client
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: (generated) `node_modules/@prisma/client`
  - **Goal**: `npx prisma generate` — no database connection required,
    only reads `schema.prisma`.
  - **Acceptance Criteria**: Every new model's TypeScript types are
    available (`prismaClient.projectMember`, etc.).
  - **Verification**: `npx tsc --noEmit` (repository files in Phase 3
    will fail to compile without this).
  - **Dependencies**: T016

- [X] T018 Generate and apply the migration
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_add_collaboration/migration.sql`
  - **Goal**: `prisma migrate dev --name add_collaboration`. If no live
    database is reachable in the working environment, hand-author the
    migration SQL from the schema diff instead (matching the exact
    convention and disclaimer used for 005-spatial-analysis-
    geoprocessing's `AnalysisRun` migration) and mark this task's DB-
    apply step explicitly BLOCKED pending a real environment.
  - **Acceptance Criteria**: Migration is purely additive (8 `CREATE
    TABLE`s, new indexes/FKs only); applies cleanly against a real
    database when one is available.
  - **Verification**: `npm run test:db:up` / `prisma migrate deploy`
    completes with no errors, or is marked BLOCKED with the reason
    recorded.
  - **Dependencies**: T016

- [X] T019 [P] Verify indexes against data-model.md
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma`
  - **Goal**: Confirm every index data-model.md specifies exists exactly:
    `ProjectMember`, `Invitation`, `Comment`, `Activity`, `Version`,
    `Notification`, `FeatureLock`, `Presence`'s index lists.
  - **Acceptance Criteria**: No missing or extra index versus
    data-model.md.
  - **Verification**: Manual schema review.
  - **Dependencies**: T016

- [X] T020 [P] Verify cascade/restrict rules against data-model.md
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma`
  - **Goal**: Confirm `Activity.userId`/`Comment.authorId`/
    `Version.createdByUserId`/`Invitation.invitedByUserId` use `Restrict`
    (attribution preserved, FR-048) while `ProjectMember.userId`/
    `FeatureLock.lockedByUserId`/`Presence.userId`/
    `Notification.recipientUserId`/`Invitation.invitedUserId` use
    `Cascade` (Edge Cases: deleted users) — per data-model.md's explicit
    two-rule distinction.
  - **Acceptance Criteria**: Every one of the eight new models' `User`
    relation(s) matches the documented rule exactly.
  - **Verification**: Manual schema review.
  - **Dependencies**: T016

- [X] T021 Seed script: add a second collaborator test user
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/seed.ts`
  - **Goal**: Idempotently seed a second `User` row (e.g.,
    `DEV_COLLABORATOR_USER_ID` env var, mirroring the existing
    `DEV_USER_ID` pattern) — `quickstart.md`'s Prerequisites explicitly
    require two seeded users for every multi-user scenario in this
    feature.
  - **Acceptance Criteria**: Running the seed script any number of times
    never creates a duplicate or errors (same `upsert` pattern as the
    existing seed).
  - **Verification**: `npx tsx prisma/seed.ts` (or BLOCKED if no live
    database, same as T018).
  - **Dependencies**: T018

- [X] T022 **Checkpoint** — Database quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the schema/migration/seed layer is sound before any
    repository code is written against it.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, `prisma validate`
    clean; migration applies or is explicitly BLOCKED with reason;
    `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T016–T021

---

## Phase 3 — Repository Layer

**Purpose**: Every new repository file, plus the narrowly-scoped
modification to the three existing ownership-scoping helpers and two
existing feature-write functions research.md Decision 10 requires.

- [X] T023 [P] `src/server/repositories/membershipRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/membershipRepository.ts`
  - **Goal**: `listMembersForProject`, `changeMemberRole` (releases the
    member's active `FeatureLock`s on downgrade, Edge Cases), `removeMember`
    (releases locks/presence), `transferOwnership` (updates
    `Project.ownerId` + both `ProjectMember.role` rows in one
    transaction, FR-003).
  - **Acceptance Criteria**: Every function ownership/role-scoped
    identically to `featureRepository.ts`'s conventions.
  - **Verification**: Covered by T034.
  - **Dependencies**: T017

- [X] T024 [P] `src/server/repositories/invitationRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/invitationRepository.ts`
  - **Goal**: `createInvitation` (no-op on existing pending/member match,
    Edge Cases: duplicate invitations), `listInvitationsForProject`,
    `acceptInvitation` (creates `ProjectMember`, writes `Activity` +
    `Notification` in one transaction), `declineInvitation`.
  - **Acceptance Criteria**: A second invite attempt for an already-
    pending/already-member user returns the existing row unchanged, not
    an error and not a duplicate.
  - **Verification**: Covered by T035.
  - **Dependencies**: T017

- [X] T025 [P] `src/server/repositories/commentRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/commentRepository.ts`
  - **Goal**: `listCommentsForFeature` (threaded), `createComment`
    (parses `@mentions` per research.md Decision 11, writes a
    `Notification` per mention in the same transaction), `updateComment`
    (author-only), `resolveComment`, `deleteComment` (author-only,
    cascades to replies).
  - **Acceptance Criteria**: Editing/deleting another author's comment
    throws `ForbiddenError` (FR-035); resolving never deletes/hides a
    reply (FR-033).
  - **Verification**: Covered by T036.
  - **Dependencies**: T017

- [X] T026 [P] `src/server/repositories/activityRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/activityRepository.ts`
  - **Goal**: `recordActivity(tx, ...)` — takes an **existing** transaction
    client, never opens its own (research.md Decision 8); no update/
    delete function exists at all (FR-047, append-only).
    `listActivityForProject` (cursor-paginated) is the only reader.
  - **Acceptance Criteria**: There is no exported function capable of
    modifying or deleting an existing `Activity` row.
  - **Verification**: Covered by T037.
  - **Dependencies**: T017

- [X] T027 [P] `src/server/repositories/versionRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/versionRepository.ts`
  - **Goal**: `saveVersion` (full layer/feature/attribute/style
    snapshot, research.md Decision 7), `listVersionsForProject`
    (metadata only), `getVersionById` (full detail), `restoreVersion`
    (pre-restore snapshot + replace + `Activity` row, one transaction,
    FR-028/FR-029), `compareVersions` (diff two snapshots at read time,
    FR-030).
  - **Acceptance Criteria**: `restoreVersion` never deletes any existing
    `Version` row (SC-007); a restore always results in exactly one more
    version than existed before it.
  - **Verification**: Covered by T038.
  - **Dependencies**: T017

- [X] T028 [P] `src/server/repositories/notificationRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/notificationRepository.ts`
  - **Goal**: `createNotification(tx, ...)` (same in-transaction
    convention as `recordActivity`), `listNotificationsForUser` (+
    `unreadCount`), `markNotificationRead`, `markAllNotificationsRead`.
  - **Acceptance Criteria**: A caller can only mark their own
    notifications read (`ForbiddenError` otherwise).
  - **Verification**: Covered by T039.
  - **Dependencies**: T017

- [X] T029 [P] `src/server/repositories/featureLockRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/featureLockRepository.ts`
  - **Goal**: `acquireOrRefreshLock` (`ConflictError` if held by a
    different, unexpired holder), `releaseLock`,
    `getActiveLockForFeature` (expiry checked at read time, research.md
    Decision 3 — a lock past `expiresAt` is treated as released).
  - **Acceptance Criteria**: The same holder refreshing their own lock
    never conflicts with themselves.
  - **Verification**: Covered by T040.
  - **Dependencies**: T017

- [X] T030 [P] `src/server/repositories/presenceRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/presenceRepository.ts`
  - **Goal**: `upsertPresence` (heartbeat — refreshes `lastSeenAt`),
    `listActivePresenceForProject` (filters rows older than the 30 s
    timeout at read time, opportunistically deletes stale rows,
    research.md Decision 3).
  - **Acceptance Criteria**: A presence row older than 30 s never appears
    in the active list.
  - **Verification**: Covered by T041.
  - **Dependencies**: T017

- [X] T031 Broaden `projectRepository.getProjectById`'s ownership scope
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/projectRepository.ts`
  - **Goal**: `WHERE` clause broadens from `{id, ownerId}` to `{id,
    OR: [{ownerId}, {members: {some: {userId}}}]}` — every function
    signature and caller unchanged (research.md Decision 10). The
    parameter name `ownerId` is deliberately left as-is (documented
    naming inconsistency, not renamed, to avoid an unrelated large-
    blast-radius rename).
  - **Acceptance Criteria**: An Editor/Viewer member can now resolve a
    project they don't own; a non-member still cannot (404 unchanged).
  - **Verification**: Covered by T042.
  - **Dependencies**: T023 (needs `ProjectMember` to query)

- [X] T032 Broaden `layerRepository.getLayerScopedToOwner`'s ownership scope
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/layerRepository.ts`
  - **Goal**: Identical broadening to T031, scoped through the layer's
    parent project's membership.
  - **Acceptance Criteria**: Same as T031, applied to every layer
    operation (list/create/rename/reorder/delete).
  - **Verification**: Covered by T042.
  - **Dependencies**: T023

- [X] T033 Broaden `featureRepository`'s ownership scope + add lock/conflict guards
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/featureRepository.ts`
  - **Goal**: `getFeatureScopedToOwner` broadens identically to T031/T032.
    `updateFeature`/`deleteFeature` each gain one guard clause calling
    `getActiveLockForFeature` first (`ConflictError` if locked by
    another user, research.md Decision 4); `updateFeature` additionally
    accepts an optional `expectedUpdatedAt` and throws `ConflictError` if
    it no longer matches the feature's current `updatedAt` (Decision 5).
    Every other existing behavior (geometry validation, attribute/style
    handling) is unchanged.
  - **Acceptance Criteria**: A locked feature's update/delete from a
    different user is rejected `409`; an `expectedUpdatedAt` mismatch is
    rejected `409`; every existing 003-database-foundation test for
    these two functions still passes unmodified.
  - **Verification**: Covered by T042.
  - **Dependencies**: T023, T029

- [X] T034 [P] Repository tests: `membershipRepository`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/membershipRepository.test.ts`
  - **Goal**: List/change-role/remove/transfer-ownership, including lock
    release on downgrade and the pre/post ownership-transfer role state.
  - **Acceptance Criteria**: Real-database test (skip-if-unavailable).
  - **Verification**: `npm run test -- membershipRepository` passes or skips cleanly.
  - **Dependencies**: T023

- [X] T035 [P] Repository tests: `invitationRepository`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/invitationRepository.test.ts`
  - **Goal**: Create, duplicate-invite no-op, accept (membership +
    activity + notification created), decline.
  - **Acceptance Criteria**: Duplicate-invitation edge case explicitly
    covered.
  - **Verification**: `npm run test -- invitationRepository` passes or skips cleanly.
  - **Dependencies**: T024

- [X] T036 [P] Repository tests: `commentRepository`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/commentRepository.test.ts`
  - **Goal**: Create/reply/resolve/edit/delete, mention-triggered
    notification, author-only enforcement, resolved-thread-preserves-
    replies.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- commentRepository` passes or skips cleanly.
  - **Dependencies**: T025

- [X] T037 [P] Repository tests: `activityRepository`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/activityRepository.test.ts`
  - **Goal**: `recordActivity` writes correctly inside a passed-in
    transaction; a transaction rollback (simulated failure) leaves no
    orphaned `Activity` row; pagination.
  - **Acceptance Criteria**: Transactional atomicity explicitly asserted.
  - **Verification**: `npm run test -- activityRepository` passes or skips cleanly.
  - **Dependencies**: T026

- [X] T038 [P] Repository tests: `versionRepository`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/versionRepository.test.ts`
  - **Goal**: Save, list (metadata only), restore (pre-restore snapshot
    created, content replaced, `Activity` written), compare.
  - **Acceptance Criteria**: SC-007 ("never fewer versions after a
    restore") explicitly asserted.
  - **Verification**: `npm run test -- versionRepository` passes or skips cleanly.
  - **Dependencies**: T027

- [X] T039 [P] Repository tests: `notificationRepository`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/notificationRepository.test.ts`
  - **Goal**: Create (in transaction), list + unread count, mark-read,
    mark-all-read, cross-user rejection.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- notificationRepository` passes or skips cleanly.
  - **Dependencies**: T028

- [X] T040 [P] Repository tests: `featureLockRepository`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/featureLockRepository.test.ts`
  - **Goal**: Acquire, refresh-by-same-holder, conflict-by-different-
    holder, release, expiry-treated-as-released at read time.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- featureLockRepository` passes or skips cleanly.
  - **Dependencies**: T029

- [X] T041 [P] Repository tests: `presenceRepository`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/presenceRepository.test.ts`
  - **Goal**: Upsert/heartbeat refresh, active-list excludes stale rows,
    opportunistic cleanup.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- presenceRepository` passes or skips cleanly.
  - **Dependencies**: T030

- [X] T042 Regression test: broadened ownership helpers don't break 003/004/005
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/ownershipRegression.test.ts`
  - **Goal**: Re-run the exact existing ownership-scoping assertions
    from 003-database-foundation's `projectRepository`/`layerRepository`/
    `featureRepository` test files (owner-only access, cross-owner 404)
    against the now-broadened functions, confirming zero behavior change
    for a project with no `ProjectMember` rows at all.
  - **Acceptance Criteria**: Every pre-existing assertion in those three
    test files still passes unmodified, plus new assertions for the
    member-access case.
  - **Verification**: `npm run test -- ownershipRegression` and the full
    existing 003/004/005 test suites, all passing.
  - **Dependencies**: T031, T032, T033

- [X] T043 **Checkpoint** — Repository Layer quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm every new repository and the three broadened
    helpers are correct and non-regressive before any Route Handler is
    built on top of them.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T042 pass or skip cleanly; `next build` succeeds; every new
    repository function has a one-line JSDoc summary.
  - **Verification**: Commands run clean.
  - **Dependencies**: T023–T042

---

## Phase 4 — Route Handlers

**Purpose**: Every new endpoint from `contracts/api-contracts.md`, plus
the additive extension to the two existing feature endpoints.

- [X] T044 [P] `POST`/`GET /api/projects/:projectId/invitations`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/invitations/route.ts`
  - **Goal**: `getCurrentUser` → `assertProjectRole(..., "Owner")` (write)
    → Zod validate → `invitationRepository` call → `handleRouteError`,
    matching every existing handler's shape; structured request logging
    via the existing `logger.request` pattern.
  - **Acceptance Criteria**: Non-Owner invite attempt → `403`; malformed
    body → `400`.
  - **Verification**: Covered by T065.
  - **Dependencies**: T012, T024

- [X] T045 [P] `POST /api/invitations/:invitationId/accept`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/invitations/[invitationId]/accept/route.ts`
  - **Goal**: Calls `acceptInvitation`.
  - **Acceptance Criteria**: Only the invited user may accept their own
    invitation (`403`/`404` otherwise, non-disclosing).
  - **Verification**: Covered by T065.
  - **Dependencies**: T024

- [X] T046 [P] `POST /api/invitations/:invitationId/decline`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/invitations/[invitationId]/decline/route.ts`
  - **Goal**: Calls `declineInvitation`.
  - **Acceptance Criteria**: Same access restriction as T045.
  - **Verification**: Covered by T065.
  - **Dependencies**: T024

- [X] T047 [P] `GET /api/projects/:projectId/members`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/members/route.ts`
  - **Goal**: Calls `listMembersForProject`, any member may read.
  - **Acceptance Criteria**: Non-member → `404`.
  - **Verification**: Covered by T065.
  - **Dependencies**: T012, T023

- [X] T048 [P] `PATCH`/`DELETE /api/projects/:projectId/members/:userId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/members/[userId]/route.ts`
  - **Goal**: `assertProjectRole(..., "Owner")` → `changeMemberRole` /
    `removeMember`.
  - **Acceptance Criteria**: Non-Owner attempt → `403` (US1 scenario 5).
  - **Verification**: Covered by T065.
  - **Dependencies**: T012, T023

- [X] T049 [P] `POST /api/projects/:projectId/transfer-ownership`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/transfer-ownership/route.ts`
  - **Goal**: `assertProjectRole(..., "Owner")` → `transferOwnership`.
  - **Acceptance Criteria**: Editor attempting transfer → `403` (US1
    scenario 6).
  - **Verification**: Covered by T065.
  - **Dependencies**: T012, T023

- [X] T050 [P] `GET`/`POST /api/features/:featureId/comments`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/features/[featureId]/comments/route.ts`
  - **Goal**: `assertProjectRole(..., "Viewer")` for read, `"Editor"` for
    create → `commentRepository` calls.
  - **Acceptance Criteria**: A Viewer can read but not post; `body`
    validated non-empty.
  - **Verification**: Covered by T066.
  - **Dependencies**: T012, T025

- [X] T051 [P] `PATCH`/`DELETE /api/comments/:commentId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/comments/[commentId]/route.ts`
  - **Goal**: Calls `updateComment`/`resolveComment`/`deleteComment`.
  - **Acceptance Criteria**: Non-author edit/delete → `403` (FR-035);
    any member may toggle `resolved`.
  - **Verification**: Covered by T066.
  - **Dependencies**: T025

- [X] T052 [P] `GET /api/projects/:projectId/activity`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/activity/route.ts`
  - **Goal**: Cursor-paginated, mirroring `GET
    /api/layers/:layerId/features`'s exact query-param parsing pattern.
  - **Acceptance Criteria**: No write method exists on this route at all
    (FR-047).
  - **Verification**: Covered by T067.
  - **Dependencies**: T012, T026

- [X] T053 [P] `POST`/`GET /api/projects/:projectId/versions`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/versions/route.ts`
  - **Goal**: `assertProjectRole(..., "Editor")` for save → `saveVersion`;
    any member may list (metadata only).
  - **Acceptance Criteria**: Viewer cannot save a version.
  - **Verification**: Covered by T067.
  - **Dependencies**: T012, T027

- [X] T054 [P] `GET /api/versions/:versionId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/versions/[versionId]/route.ts`
  - **Goal**: Full detail including `snapshot`, via `getVersionById`.
  - **Acceptance Criteria**: Non-member → `404`.
  - **Verification**: Covered by T067.
  - **Dependencies**: T027

- [X] T055 [P] `POST /api/versions/:versionId/restore`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/versions/[versionId]/restore/route.ts`
  - **Goal**: `assertProjectRole(..., "Editor")` → `restoreVersion`.
  - **Acceptance Criteria**: Returns the new pre-restore version
    (`201`); Viewer cannot restore.
  - **Verification**: Covered by T067.
  - **Dependencies**: T012, T027

- [X] T056 [P] `GET /api/versions/compare`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/versions/compare/route.ts`
  - **Goal**: Query params `a`, `b` → `compareVersions`.
  - **Acceptance Criteria**: Both versions must belong to the same
    project the caller can access, or `404`.
  - **Verification**: Covered by T067.
  - **Dependencies**: T027

- [X] T057 [P] `GET /api/notifications`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/notifications/route.ts`
  - **Goal**: Caller's own notifications only, cursor-paginated, plus
    `unreadCount` in the envelope (FR-038).
  - **Acceptance Criteria**: Never returns another user's notifications.
  - **Verification**: Covered by T068.
  - **Dependencies**: T028

- [X] T058 [P] `PATCH /api/notifications/:notificationId/read`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/notifications/[notificationId]/read/route.ts`
  - **Goal**: Calls `markNotificationRead`.
  - **Acceptance Criteria**: Marking another user's notification → `404`
    (non-disclosing).
  - **Verification**: Covered by T068.
  - **Dependencies**: T028

- [X] T059 [P] `POST /api/notifications/mark-all-read`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/notifications/mark-all-read/route.ts`
  - **Goal**: Calls `markAllNotificationsRead` for the caller only.
  - **Acceptance Criteria**: Never affects another user's notifications.
  - **Verification**: Covered by T068.
  - **Dependencies**: T028

- [X] T060 [P] `POST`/`DELETE /api/features/:featureId/lock`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/features/[featureId]/lock/route.ts`
  - **Goal**: `assertProjectRole(..., "Editor")` → `acquireOrRefreshLock`
    / `releaseLock`.
  - **Acceptance Criteria**: `409` when held by a different, unexpired
    user (US3 scenario 2); Viewer cannot acquire a lock at all.
  - **Verification**: Covered by T068.
  - **Dependencies**: T012, T029

- [X] T061 [P] `POST /api/projects/:projectId/presence/heartbeat`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/presence/heartbeat/route.ts`
  - **Goal**: `assertProjectRole(..., "Viewer")` (any member may have
    presence) → `upsertPresence`.
  - **Acceptance Criteria**: Non-member → `404`.
  - **Verification**: Covered by T068.
  - **Dependencies**: T012, T030

- [X] T062 [P] `GET /api/projects/:projectId/presence`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/presence/route.ts`
  - **Goal**: Initial snapshot via `listActivePresenceForProject`, used
    once on page load before the SSE connection (T107) takes over.
  - **Acceptance Criteria**: Only currently-active (non-stale) rows
    returned.
  - **Verification**: Covered by T068.
  - **Dependencies**: T030

- [X] T063 Extend `PATCH`/`DELETE /api/features/:featureId` (Conflict APIs)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/features/[featureId]/route.ts`,
    `src/shared/contracts/feature.schema.ts`
  - **Goal**: `updateFeatureSchema` gains an additive optional
    `expectedUpdatedAt` field; both handlers surface the new
    `ConflictError` → `409` from T033's guard clauses, via the existing
    `handleRouteError` (no handler-level change beyond the schema
    field — the error mapping is centralized already).
  - **Acceptance Criteria**: Every existing caller that never sends
    `expectedUpdatedAt` sees zero behavior change; a mismatched value or
    an active foreign lock now returns `409`.
  - **Verification**: Covered by T069; full existing
    `features.api.test.ts` suite (003-database-foundation) still passes
    unmodified.
  - **Dependencies**: T033

- [X] T064 `GET /api/projects/:projectId/stream` — placeholder
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/stream/route.ts`
  - **Goal**: Route file created with auth/access-check only (`404` for
    non-members) — the actual `ReadableStream`/SSE body is completed in
    Phase 8 (T107), once `channel.ts`'s `subscribe` is fully wired to a
    real event flow worth streaming.
  - **Acceptance Criteria**: Non-member request rejected before any
    stream would open.
  - **Verification**: Covered by T069 (access-check path only at this
    phase).
  - **Dependencies**: T013

- [X] T065 [P] API test suite: sharing/member/invitation endpoints
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/__tests__/sharing.api.test.ts`
  - **Goal**: Success, role-insufficient (`403`), cross-member (`404`),
    duplicate-invitation, malformed-body (`400`) paths for T044–T049.
  - **Acceptance Criteria**: All five endpoints' documented error cases
    covered.
  - **Verification**: `npm run test -- sharing.api` passes or skips cleanly.
  - **Dependencies**: T044–T049

- [X] T066 [P] API test suite: comment endpoints
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/features/[featureId]/__tests__/comments.api.test.ts`
  - **Goal**: Create/reply/resolve/edit/delete, author-only enforcement,
    Viewer read-only enforcement.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- comments.api` passes or skips cleanly.
  - **Dependencies**: T050, T051

- [X] T067 [P] API test suite: activity/version endpoints
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/__tests__/activityVersion.api.test.ts`
  - **Goal**: Activity pagination; version save/list/detail/restore/
    compare, including SC-007's "never fewer versions" assertion at the
    API layer.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- activityVersion.api` passes or skips cleanly.
  - **Dependencies**: T052–T056

- [X] T068 [P] API test suite: notification/lock/presence endpoints
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/__tests__/notificationLockPresence.api.test.ts`
  - **Goal**: Notification list/read/mark-all, lock acquire/conflict/
    release, presence heartbeat/snapshot.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- notificationLockPresence.api` passes or skips cleanly.
  - **Dependencies**: T057–T062

- [X] T069 [P] API test suite: conflict extension + stream access check
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/features/[featureId]/__tests__/conflict.api.test.ts`
  - **Goal**: `expectedUpdatedAt` mismatch → `409`; locked-by-another →
    `409`; stream endpoint's non-member `404`.
  - **Acceptance Criteria**: All covered; existing (unmodified)
    `features.api.test.ts` from 003-database-foundation still passes.
  - **Verification**: `npm run test -- conflict.api` and the full
    existing features API suite, both passing.
  - **Dependencies**: T063, T064

- [X] T070 Security spot-check: cross-member 404 + insufficient-role 403 sweep
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/__tests__/collaboration.security.test.ts`
  - **Goal**: Every one of the ~21 endpoints from T044–T064 tested once
    for a non-member (`404`) and, where a role distinction applies, once
    for an insufficient-role member (`403`) — consolidated in one file
    for easy regression tracking.
  - **Acceptance Criteria**: Every endpoint covered exactly once per
    applicable case.
  - **Verification**: `npm run test -- collaboration.security` passes or skips cleanly.
  - **Dependencies**: T044–T064

- [X] T071 **Checkpoint** — Route Handlers quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm every new/extended endpoint is correct, secure, and
    non-regressive.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests through
    T070 pass or skip cleanly; `next build` succeeds; every Route
    Handler follows the documented `getCurrentUser → rate-limit/role →
    validate → repository → handleRouteError` shape with structured
    logging.
  - **Verification**: Commands run clean.
  - **Dependencies**: T044–T070

---

## Phase 5 — Client Services

**Purpose**: Thin service wrappers, centralized query keys, and the two
client-side infrastructure pieces (realtime client, offline queue) every
hook in Phase 6 depends on.

- [X] T072 [P] `src/features/collaboration/services/membershipService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/services/membershipService.ts`
  - **Goal**: `listMembers`, `changeRole`, `removeMember`,
    `transferOwnership` — thin `apiFetch` wrappers, zero business logic.
  - **Acceptance Criteria**: Matches T044–T049's contracts exactly.
  - **Verification**: Covered by Phase 6's hook tests.
  - **Dependencies**: T044, T047, T048, T049

- [X] T073 [P] `src/features/collaboration/services/invitationService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/services/invitationService.ts`
  - **Goal**: `invite`, `listInvitations`, `accept`, `decline`.
  - **Acceptance Criteria**: Matches T044–T046.
  - **Verification**: Covered by Phase 6.
  - **Dependencies**: T044, T045, T046

- [X] T074 [P] `src/features/collaboration/services/commentService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/services/commentService.ts`
  - **Goal**: `listComments`, `createComment`, `updateComment`,
    `resolveComment`, `deleteComment`.
  - **Acceptance Criteria**: Matches T050–T051.
  - **Verification**: Covered by Phase 6.
  - **Dependencies**: T050, T051

- [X] T075 [P] `src/features/collaboration/services/activityService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/services/activityService.ts`
  - **Goal**: `listActivity`.
  - **Acceptance Criteria**: Matches T052.
  - **Verification**: Covered by Phase 6.
  - **Dependencies**: T052

- [X] T076 [P] `src/features/collaboration/services/versionService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/services/versionService.ts`
  - **Goal**: `saveVersion`, `listVersions`, `getVersion`,
    `restoreVersion`, `compareVersions`.
  - **Acceptance Criteria**: Matches T053–T056.
  - **Verification**: Covered by Phase 6.
  - **Dependencies**: T053, T054, T055, T056

- [X] T077 [P] `src/features/collaboration/services/notificationService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/services/notificationService.ts`
  - **Goal**: `listNotifications`, `markRead`, `markAllRead`.
  - **Acceptance Criteria**: Matches T057–T059.
  - **Verification**: Covered by Phase 6.
  - **Dependencies**: T057, T058, T059

- [X] T078 [P] `src/features/collaboration/services/lockService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/services/lockService.ts`
  - **Goal**: `acquireLock`, `releaseLock`.
  - **Acceptance Criteria**: Matches T060.
  - **Verification**: Covered by Phase 6.
  - **Dependencies**: T060

- [X] T079 [P] `src/features/collaboration/services/presenceService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/services/presenceService.ts`
  - **Goal**: `heartbeat`, `getSnapshot`.
  - **Acceptance Criteria**: Matches T061–T062.
  - **Verification**: Covered by Phase 6.
  - **Dependencies**: T061, T062

- [X] T080 `src/features/collaboration/services/queryKeys.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/services/queryKeys.ts`
  - **Goal**: Centralized factory for `members`, `invitations`,
    `comments`, `activity`, `versions`, `version`, `notifications` keys —
    never an inline array literal anywhere in this feature (matching the
    fix already applied to `database`'s `queryKeys.featuresList` in
    005's Phase 9 audit).
  - **Acceptance Criteria**: Every hook in Phase 6 imports from this file
    exclusively.
  - **Verification**: `npx tsc --noEmit`; grep-based guard in T199.
  - **Dependencies**: T072–T079

- [X] T081 `src/features/collaboration/services/realtimeClient.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/services/realtimeClient.ts`
  - **Goal**: Thin wrapper around native `EventSource` connecting to
    `GET /api/projects/:projectId/stream`; dispatches incoming
    `feature`/`layer`/`presence`/`lock`/`comment`/`notification` events
    to registered callbacks. Reconnection is `EventSource`'s own native
    behavior (FR-018) — no hand-rolled reconnect loop here.
  - **Acceptance Criteria**: Exposes `onEvent(type, callback)` and
    `close()`; connection status transitions observable for
    `collaborationStore` (Phase 7) to consume.
  - **Verification**: Covered by T117/T118.
  - **Dependencies**: T004

- [X] T082 `src/features/collaboration/services/offlineQueue.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/services/offlineQueue.ts`
  - **Goal**: A small wrapper over the native `indexedDB` API storing
    `{id, mutationType, payload, featureExpectedUpdatedAt, status}` rows
    (research.md Decision 6) — no new npm dependency.
  - **Acceptance Criteria**: `enqueue`, `listPending`, `markSubmitted`,
    `markConflicted` all persist across a simulated page reload (jsdom's
    `fake-indexeddb`-equivalent test double, or a manual mock matching
    this project's existing browser-API-mocking convention).
  - **Verification**: Covered by T096.
  - **Dependencies**: T004

- [X] T083 **Checkpoint** — Client Services quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the full client service/realtime/offline-queue
    layer is sound before any hook is built on top of it.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; `next build`
    succeeds; every service function has a one-line JSDoc summary.
  - **Verification**: Commands run clean.
  - **Dependencies**: T072–T082

---

## Phase 6 — React Query Hooks

**Purpose**: Every hook `client-api.md` defines, plus the cache-
invalidation wiring connecting realtime events to React Query.

- [X] T084 [P] `useMembers`/`useChangeRole`/`useRemoveMember`/`useTransferOwnership`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/useMembers.ts`
  - **Goal**: Query + three mutations, invalidating
    `queryKeys.members(projectId)` on success.
  - **Acceptance Criteria**: Matches `membershipService.ts` 1:1.
  - **Verification**: Covered by T094.
  - **Dependencies**: T072, T080

- [X] T085 [P] `useInvitations`/`useInvite`/`useAcceptInvitation`/`useDeclineInvitation`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/useInvitations.ts`
  - **Goal**: Query + three mutations, invalidating
    `queryKeys.invitations(projectId)` on success; `useAcceptInvitation`
    additionally invalidates `queryKeys.members(projectId)`.
  - **Acceptance Criteria**: Matches `invitationService.ts` 1:1.
  - **Verification**: Covered by T094.
  - **Dependencies**: T073, T080

- [X] T086 [P] `useComments`/`useCreateComment`/`useUpdateComment`/`useResolveComment`/`useDeleteComment`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/useComments.ts`
  - **Goal**: Query + four mutations, invalidating
    `queryKeys.comments(featureId)` on success.
  - **Acceptance Criteria**: Matches `commentService.ts` 1:1.
  - **Verification**: Covered by T095.
  - **Dependencies**: T074, T080

- [X] T087 [P] `useActivity`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/useActivity.ts`
  - **Goal**: Cursor-paginated query, mirroring `database`'s
    `useFeatures` pattern exactly.
  - **Acceptance Criteria**: Matches `activityService.ts` 1:1.
  - **Verification**: Covered by T095.
  - **Dependencies**: T075, T080

- [X] T088 [P] `useVersions`/`useSaveVersion`/`useRestoreVersion`/`useCompareVersions`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/useVersions.ts`
  - **Goal**: Query + three mutations; `useRestoreVersion`'s `onSuccess`
    invalidates `queryKeys.versions(projectId)` **and** `database`'s
    `queryKeys.layers`/`queryKeys.featuresList` broadly (imported from
    `database`'s public barrel) — a restore can change anything.
  - **Acceptance Criteria**: Cross-feature invalidation explicitly
    asserted in the hook test (T095).
  - **Verification**: Covered by T095.
  - **Dependencies**: T076, T080

- [X] T089 [P] `useNotifications`/`useMarkNotificationRead`/`useMarkAllNotificationsRead`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/useNotifications.ts`
  - **Goal**: Query (+ `unreadCount`) + two mutations.
  - **Acceptance Criteria**: Matches `notificationService.ts` 1:1.
  - **Verification**: Covered by T096.
  - **Dependencies**: T077, T080

- [X] T090 [P] `useFeatureLock`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/useFeatureLock.ts`
  - **Goal**: Wraps acquire (on entering edit mode)/release (on save or
    cancel) — integrates with 004-map-editing-ui's existing edit-mode
    lifecycle at its two existing entry/exit points (`FeatureLayer`'s
    edit-mode toggle, `DrawingToolbar`'s cancel), not a new lifecycle.
  - **Acceptance Criteria**: A `409` from `acquireLock` surfaces via
    `editingStore.setLastError` (004's existing error-display
    convention, reused, not duplicated).
  - **Verification**: Covered by T096.
  - **Dependencies**: T078, T080

- [X] T091 [P] `usePresence`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/usePresence.ts`
  - **Goal**: ~10 s heartbeat interval + realtime-pushed presence list
    consumption (from `collaborationStore`, Phase 7).
  - **Acceptance Criteria**: Heartbeat stops cleanly on unmount (no
    interval leak).
  - **Verification**: Covered by T096.
  - **Dependencies**: T079, T080

- [X] T092 `useOfflineQueue`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/useOfflineQueue.ts`
  - **Goal**: Wraps `database`'s existing `useCreateFeature`/
    `useUpdateFeature`/`useDeleteFeature` mutations with the IndexedDB
    queue-and-replay layer (T082) — decorates, does not duplicate, their
    logic.
  - **Acceptance Criteria**: An edit made while `navigator.onLine` is
    `false` is queued, not attempted over the network.
  - **Verification**: Covered by T096.
  - **Dependencies**: T082

- [X] T093 Cache-invalidation wiring: realtime events → React Query
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/useRealtimeInvalidation.ts`
  - **Goal**: A small hook mounted once per open project, subscribing to
    `realtimeClient`'s `comment`/`notification`/`member` events and
    calling the exact same `queryClient.invalidateQueries` a
    corresponding mutation's `onSuccess` would — one convergent
    invalidation path, not two parallel ones (plan.md React Query Flow).
  - **Acceptance Criteria**: An incoming realtime `comment` event
    invalidates `queryKeys.comments(featureId)` identically to
    `useCreateComment`'s own `onSuccess`.
  - **Verification**: Covered by T118.
  - **Dependencies**: T081, T086, T089

- [X] T094 [P] Hook tests: sharing hooks (`useMembers`, `useInvitations`)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/__tests__/useMembers.test.tsx`, `useInvitations.test.tsx`
  - **Goal**: Against mocked services, asserting correct invalidation.
  - **Acceptance Criteria**: All mutations covered.
  - **Verification**: `npm run test -- useMembers useInvitations` passes.
  - **Dependencies**: T084, T085

- [X] T095 [P] Hook tests: comment/activity/version hooks
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/__tests__/useComments.test.tsx`, `useActivity.test.tsx`, `useVersions.test.tsx`
  - **Goal**: Against mocked services; `useRestoreVersion`'s cross-
    feature invalidation into `database`'s query keys explicitly
    asserted.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- useComments useActivity useVersions` passes.
  - **Dependencies**: T086, T087, T088

- [X] T096 [P] Hook tests: notification/lock/presence/offline hooks
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/__tests__/useNotifications.test.tsx`, `useFeatureLock.test.tsx`, `usePresence.test.tsx`, `useOfflineQueue.test.tsx`
  - **Goal**: Against mocked services/IndexedDB; `useOfflineQueue`'s
    queue-then-replay-in-order behavior explicitly asserted.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- useNotifications useFeatureLock usePresence useOfflineQueue` passes.
  - **Dependencies**: T089, T090, T091, T092

- [X] T097 **Checkpoint** — React Query Hooks quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm every hook and the realtime-to-cache invalidation
    bridge are correct before any store/UI work depends on them.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T096 pass; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T084–T096

---

## Phase 7 — Zustand Stores

**Purpose**: The one new, genuinely-justified store (research.md
Decision 6) — deliberately **not** six separate stores; see the note
below on why "Comment Store"/"Clipboard Store" are not built.

> **Scope note**: research.md Decision 6 and `client-api.md` approved
> exactly one new store, `collaborationStore`, holding only ephemeral
> realtime state (presence, locks, connection status, a live unread-
> count mirror) that genuinely doesn't belong in a React Query cache. A
> separate "Comment Store" would shadow-cache what `useComments` (React
> Query) already owns — forbidden by the Constitution's Additional
> Engineering Standards ("Server state MUST NOT be copied into a Zustand
> store as a shadow cache"). A separate "Clipboard Store" would duplicate
> 004-map-editing-ui's existing `editingStore.clipboard` — forbidden by
> this task list's own "never duplicate code" requirement. Both are
> deliberately not built; T103 documents this as a verification task
> rather than silently skipping it.

- [X] T098 [P] `collaborationStore.ts` — presence slice
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/store/collaborationStore.ts`
  - **Goal**: `activePresence: Record<userId, PresenceState>` +
    `setPresence`/`removePresence` actions, updated from realtime
    `presence` events (not React Query — a live stream, not a request/
    response cache).
  - **Acceptance Criteria**: Matches `client-api.md`'s field list.
  - **Verification**: Covered by T104.
  - **Dependencies**: T014

- [X] T099 [P] `collaborationStore.ts` — lock slice
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/store/collaborationStore.ts`
  - **Goal**: `activeLocks: Record<featureId, {lockedByUserId,
    expiresAt}>` + `setLock`/`clearLock` actions, updated from realtime
    `lock` events.
  - **Acceptance Criteria**: Matches `client-api.md`.
  - **Verification**: Covered by T104.
  - **Dependencies**: T014

- [X] T100 [P] `collaborationStore.ts` — connection-status slice
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/store/collaborationStore.ts`
  - **Goal**: `connectionStatus: "connected" | "reconnecting" |
    "disconnected"` + `setConnectionStatus`, driven by
    `realtimeClient`'s `EventSource` `onopen`/`onerror` callbacks.
  - **Acceptance Criteria**: Matches `client-api.md`.
  - **Verification**: Covered by T104.
  - **Dependencies**: T081

- [X] T101 [P] `collaborationStore.ts` — notification-count slice
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/store/collaborationStore.ts`
  - **Goal**: `unreadNotificationCount` + `setUnreadCount`, updated
    instantly on a realtime `notification` event so the badge doesn't
    wait for `useNotifications`'s next refetch — explicitly documented
    as a **mirror** of the durable count (React Query remains the source
    of truth), not a replacement for it.
  - **Acceptance Criteria**: Matches `client-api.md`.
  - **Verification**: Covered by T104.
  - **Dependencies**: T089

- [X] T102 Confirm no persistence middleware is applied
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/store/collaborationStore.ts`
  - **Goal**: Verify `collaborationStore` is session-only (no
    `persist`/`localStorage` middleware) — every field is ephemeral
    realtime state that should not survive a reload, matching
    `editingStore`'s existing session-only precedent.
  - **Acceptance Criteria**: A page reload starts with an empty store,
    repopulated only once a fresh SSE connection/heartbeat delivers data.
  - **Verification**: Manual code review.
  - **Dependencies**: T098–T101

- [X] T103 Verify comment/clipboard state is reused, not duplicated
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification task)
  - **Goal**: Confirm no new store exists for comment state (owned by
    `useComments`/React Query) or clipboard state (owned by 004's
    `editingStore.clipboard`) — per the Scope Note above.
  - **Acceptance Criteria**: A grep for a "commentStore"/"clipboardStore"
    file in this feature returns nothing.
  - **Verification**: Manual review; folded into T199's architecture
    guard test.
  - **Dependencies**: T086

- [X] T104 [P] Unit tests: `collaborationStore` actions
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/__tests__/collaborationStore.test.ts`
  - **Goal**: All four slices' actions directly asserted (presence set/
    remove, lock set/clear, connection status transitions, unread count
    updates).
  - **Acceptance Criteria**: 100% of exported actions referenced.
  - **Verification**: `npm run test -- collaborationStore` passes.
  - **Dependencies**: T098–T101

- [X] T105 **Checkpoint** — Zustand Stores quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the one new store is correct and that no
    duplicate/shadow-cache store was introduced.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T104 pass; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T098–T104

---

## Phase 8 — Real-Time Collaboration

**Purpose**: Complete the SSE stream endpoint and wire `publish()` into
every write path that must broadcast — the integration pass connecting
Phases 3–7's pieces into one live system.

- [X] T106 Complete `channel.ts`'s reconnect-with-backoff logic
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/realtime/channel.ts`
  - **Goal**: The server's own dedicated `LISTEN` connection (T013)
    gains a reconnect-with-backoff loop independent of any client's
    `EventSource` reconnect (plan.md Risks) — a dropped `LISTEN`
    connection must not silently stop all fan-out for that process.
  - **Acceptance Criteria**: A simulated connection drop triggers
    reconnection within a bounded number of attempts/backoff schedule.
  - **Verification**: Covered by T117.
  - **Dependencies**: T013

- [X] T107 Complete `GET /api/projects/:projectId/stream`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/stream/route.ts`
  - **Goal**: Returns a `text/event-stream` `ReadableStream` response;
    calls `subscribe(projectChannel, onEvent)` on open, writing each
    received event as an SSE message; unregisters on client disconnect
    (research.md Decisions 1–2).
  - **Acceptance Criteria**: A `publish()` call for this project's
    channel results in exactly one SSE message written to this stream.
  - **Verification**: Covered by T117.
  - **Dependencies**: T064, T106

- [X] T108 Wire `publish()` into `featureRepository.updateFeature`/`deleteFeature`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/featureRepository.ts`
  - **Goal**: After a successful update/delete, `publish(projectChannel,
    {type: "feature", ...})` inside the same transaction (or immediately
    after commit — whichever `channel.ts`'s API requires, documented in
    its own JSDoc).
  - **Acceptance Criteria**: US2 scenario 1 — a feature change is
    published exactly once per successful write.
  - **Verification**: Covered by T119.
  - **Dependencies**: T033, T107

- [X] T109 Wire `publish()` into layer create/rename/reorder/delete
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/layerRepository.ts`
  - **Goal**: Same pattern as T108, `{type: "layer", ...}`.
  - **Acceptance Criteria**: US2 scenario 2.
  - **Verification**: Covered by T119.
  - **Dependencies**: T032, T107

- [X] T110 Wire `publish()` into comment create/update/resolve/delete
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/commentRepository.ts`
  - **Goal**: Same pattern, `{type: "comment", ...}`.
  - **Acceptance Criteria**: US6 scenario 1 (every member sees a new
    comment live).
  - **Verification**: Covered by T119.
  - **Dependencies**: T025, T107

- [X] T111 Wire `publish()` into `createNotification`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/notificationRepository.ts`
  - **Goal**: `{type: "notification", recipientChannel, ...}` — published
    to the recipient's personal channel, not the project's, per
    research.md Decision 9.
  - **Acceptance Criteria**: Only the intended recipient's SSE stream
    receives the event.
  - **Verification**: Covered by T119.
  - **Dependencies**: T028, T107

- [X] T112 Wire `publish()` into lock acquire/release + lock-conflict notification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/featureLockRepository.ts`
  - **Goal**: `{type: "lock", ...}` on acquire/release; a rejected
    conflicting acquire attempt additionally triggers a `lock_conflict`
    `Notification` (FR-036) to the caller.
  - **Acceptance Criteria**: US3 scenario 1 (every member sees the lock
    indicator appear live).
  - **Verification**: Covered by T119.
  - **Dependencies**: T029, T107, T111

- [X] T113 Wire `publish()` into `upsertPresence`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/presenceRepository.ts`
  - **Goal**: `{type: "presence", ...}` on every heartbeat/cursor/extent
    change.
  - **Acceptance Criteria**: US9 scenario 2–3 (live cursor/viewport
    visible to others).
  - **Verification**: Covered by T119.
  - **Dependencies**: T030, T107

- [X] T114 Mount `realtimeClient`'s `EventSource` connection at the map-editing shell
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/map/components/MapCore.tsx` (or
    `src/features/dashboard/components/DashboardLayout.tsx`, whichever
    already owns the current-project lifecycle)
  - **Goal**: Open the SSE connection once a project is active, close it
    when the project changes/unmounts — same integration-point
    discipline as 004's `useKeyboardShortcuts` mount.
  - **Acceptance Criteria**: Exactly one open `EventSource` per active
    project per browser tab.
  - **Verification**: Covered by T119.
  - **Dependencies**: T081

- [X] T115 Wire `collaborationStore` updates from incoming SSE events
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/useRealtimeInvalidation.ts` (extended)
  - **Goal**: `presence`/`lock`/`notification` events update
    `collaborationStore` directly (T098–T101); `feature`/`layer`/
    `comment` events go through T093's React Query invalidation path
    instead.
  - **Acceptance Criteria**: Each event type routes to exactly one of
    the two paths, never both.
  - **Verification**: Covered by T118.
  - **Dependencies**: T093, T098–T101, T114

- [X] T116 Wire React Query cache invalidation from incoming SSE events
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/useRealtimeInvalidation.ts` (extended)
  - **Goal**: `feature`/`layer` events invalidate `database`'s query
    keys; `comment`/`member`/`version` events invalidate this feature's
    own query keys — completing T093's wiring against the now-real event
    flow from T108–T113.
  - **Acceptance Criteria**: Matches plan.md's React Query Flow exactly.
  - **Verification**: Covered by T118.
  - **Dependencies**: T093, T108–T111

- [X] T117 [P] WebSocket/SSE test tier: stream Route Handler
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/__tests__/stream.api.test.ts`
  - **Goal**: Open the `ReadableStream` response, call `publish()`
    directly, assert the correct SSE-formatted event is written;
    `channel.ts`'s reconnect-with-backoff tested by simulating a dropped
    connection.
  - **Acceptance Criteria**: Both covered.
  - **Verification**: `npm run test -- stream.api` passes or skips cleanly.
  - **Dependencies**: T106, T107

- [X] T118 [P] WebSocket/SSE test tier: client event dispatch
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/__tests__/realtimeClient.test.ts`
  - **Goal**: A mocked `EventSource` (jsdom has no native SSE client,
    matching this project's existing browser-API-mocking convention)
    dispatching each event type; assert `useRealtimeInvalidation`
    (T115–T116) routes each to the correct store/cache path.
  - **Acceptance Criteria**: All six event types covered.
  - **Verification**: `npm run test -- realtimeClient` passes.
  - **Dependencies**: T115, T116

- [X] T119 Integration test: two-session live update
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/__tests__/liveUpdate.integration.test.tsx`
  - **Goal**: Against the real test database (skip-if-unavailable):
    simulate two sessions, confirm a feature edit from one becomes
    visible to the other within the mocked SSE round trip.
  - **Acceptance Criteria**: Matches `quickstart.md` Section 3.
  - **Verification**: `npm run test -- liveUpdate.integration` passes or skips cleanly.
  - **Dependencies**: T108–T116

- [X] T120 **Checkpoint** — Real-Time Collaboration quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the full realtime layer — server fan-out, client
    consumption, cache/store wiring — works end to end.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T119 pass or skip cleanly; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T106–T119

---

## Phase 9 — Project Sharing (US1)

**Goal**: Deliver US1's full UI on top of Phases 1–8's now-complete
backend/realtime/state layer.

**Independent Test**: Owner invites a second member as Editor; that
member gains project access; a third, uninvited user does not.

- [ ] T121 [US1] `MemberList.tsx`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/collaboration/components/MemberList.tsx`
  - **Goal**: Lists `useMembers(projectId)`, showing each member's role;
    Owner-only role-change/remove controls per row (FR-013/FR-014).
  - **Acceptance Criteria**: A Viewer/Editor sees the list read-only, no
    management controls.
  - **Verification**: Covered by T128.
  - **Dependencies**: T084

- [ ] T122 [US1] `InviteDialog.tsx`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/collaboration/components/InviteDialog.tsx`
  - **Goal**: shadcn `Dialog` form to invite a user with a role
    selector (Editor/Viewer) — Owner-only entry point.
  - **Acceptance Criteria**: Submitting calls `useInvite`; duplicate-
    invite response is shown as a clear, non-error message.
  - **Verification**: Covered by T128.
  - **Dependencies**: T085

- [ ] T123 [US1] Accept/decline invitation UI
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/collaboration/components/InvitationResponse.tsx`
  - **Goal**: Surfaced via the notification triggered on invite (US7
    ties in here) — Accept/Decline actions calling
    `useAcceptInvitation`/`useDeclineInvitation`.
  - **Acceptance Criteria**: Accepting grants access at the assigned
    role immediately (US1 scenario 1).
  - **Verification**: Covered by T128.
  - **Dependencies**: T085

- [ ] T124 [US1] Transfer-ownership UI
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/collaboration/components/MemberList.tsx` (extended)
  - **Goal**: Owner-only "Transfer ownership" action per member row,
    confirmed via `AlertDialog` (existing shadcn primitive, reused).
  - **Acceptance Criteria**: Matches US1 scenario 4 — prior Owner
    becomes Editor, never locked out.
  - **Verification**: Covered by T128.
  - **Dependencies**: T084, T121

- [ ] T125 [US1] Remove-member UI
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/collaboration/components/MemberList.tsx` (extended)
  - **Goal**: Owner-only "Remove" action per member row, `AlertDialog`-
    confirmed.
  - **Acceptance Criteria**: Matches US1 scenario 2.
  - **Verification**: Covered by T128.
  - **Dependencies**: T084, T121

- [ ] T126 [US1] Role-change UI (`PermissionDialog.tsx`)
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/collaboration/components/PermissionDialog.tsx`
  - **Goal**: Owner-only role selector per member, calling
    `useChangeRole`.
  - **Acceptance Criteria**: Matches US1 scenario 3.
  - **Verification**: Covered by T128.
  - **Dependencies**: T084

- [ ] T127 [US1] Owner-only UI enforcement pass
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `MemberList.tsx`, `InviteDialog.tsx`, `PermissionDialog.tsx`
  - **Goal**: Every management control conditionally rendered/disabled
    for non-Owners, mirroring the server-side `403` (defense in depth,
    not the sole enforcement — Constitution Principle VI).
  - **Acceptance Criteria**: Matches US1 scenarios 5–6.
  - **Verification**: Covered by T128.
  - **Dependencies**: T121–T126

- [ ] T128 [US1] Component tests: sharing UI
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/collaboration/__tests__/MemberList.test.tsx`, `InviteDialog.test.tsx`, `PermissionDialog.test.tsx`
  - **Goal**: Every control's role-conditional rendering and mutation
    wiring.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- MemberList InviteDialog PermissionDialog` passes.
  - **Dependencies**: T121–T127

- [ ] T129 [US1] Integration test: full US1 flow
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/collaboration/__tests__/sharing.integration.test.tsx`
  - **Goal**: Invite → accept → access granted → role change → transfer
    ownership, end to end, matching `quickstart.md` Section 2.
  - **Acceptance Criteria**: Matches all of US1's acceptance scenarios.
  - **Verification**: `npm run test -- sharing.integration` passes or skips cleanly.
  - **Dependencies**: T121–T128

- [ ] T130 **Checkpoint** — Project Sharing quality gate
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: N/A
  - **Goal**: Confirm US1 is fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T129 pass; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T121–T129

---

## Phase 10 — Comments (US6)

**Goal**: Deliver US6's full UI.

**Independent Test**: One member comments on a feature; a second sees
and replies to it.

- [ ] T131 [US6] `CommentThread.tsx`
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/collaboration/components/CommentThread.tsx`
  - **Goal**: Renders `useComments(featureId)`'s threaded list — top-
    level comments with nested replies indented beneath.
  - **Acceptance Criteria**: Matches US6 scenarios 1–2.
  - **Verification**: Covered by T137.
  - **Dependencies**: T086

- [ ] T132 [US6] Comment composer (create + reply + `@mention`)
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/collaboration/components/CommentThread.tsx` (extended)
  - **Goal**: A text input calling `useCreateComment`, with a simple
    `@`-triggered member-name autocomplete (client-side convenience over
    the server's plain-text parse, research.md Decision 11).
  - **Acceptance Criteria**: Matches US6 scenario 4 (mention triggers a
    notification).
  - **Verification**: Covered by T137.
  - **Dependencies**: T086, T131

- [ ] T133 [US6] Resolve-toggle UI
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/collaboration/components/CommentThread.tsx` (extended)
  - **Goal**: A "Resolve"/"Reopen" toggle per top-level thread, calling
    `useResolveComment`.
  - **Acceptance Criteria**: Matches US6 scenario 3 — resolved thread
    stays visible, visually distinguished.
  - **Verification**: Covered by T137.
  - **Dependencies**: T086, T131

- [ ] T134 [US6] Edit/delete own comment UI
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/collaboration/components/CommentThread.tsx` (extended)
  - **Goal**: Edit/Delete actions shown only on the caller's own
    comments (matches server-side `authorId` check, defense in depth).
  - **Acceptance Criteria**: Matches US6 scenario 5.
  - **Verification**: Covered by T137.
  - **Dependencies**: T086, T131

- [ ] T135 [US6] Comment filtering (resolved/unresolved)
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/collaboration/components/CommentThread.tsx` (extended)
  - **Goal**: A toggle/filter to show all, unresolved-only, or resolved-
    only threads.
  - **Acceptance Criteria**: Filter never removes a comment from the
    underlying data, only the current view.
  - **Verification**: Covered by T137.
  - **Dependencies**: T131

- [ ] T136 [US6] Comment sorting (newest/oldest)
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/collaboration/components/CommentThread.tsx` (extended)
  - **Goal**: A sort toggle for top-level threads (replies always stay
    chronological within their thread).
  - **Acceptance Criteria**: Sorting never affects reply order within a
    thread.
  - **Verification**: Covered by T137.
  - **Dependencies**: T131

- [ ] T137 [US6] Component tests: `CommentThread`
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/collaboration/__tests__/CommentThread.test.tsx`
  - **Goal**: Create/reply/resolve/edit/delete/mention/filter/sort, all
    against mocked `commentService`.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- CommentThread` passes.
  - **Dependencies**: T131–T136

- [ ] T138 [US6] Integration test: comment → mention → notification
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/collaboration/__tests__/commentMention.integration.test.tsx`
  - **Goal**: Full flow matching `quickstart.md` Section 7.
  - **Acceptance Criteria**: Matches US6 scenario 4 + US7 scenario 1.
  - **Verification**: `npm run test -- commentMention.integration` passes or skips cleanly.
  - **Dependencies**: T132

- [ ] T139 **Checkpoint** — Comments quality gate
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: N/A
  - **Goal**: Confirm US6 is fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T138 pass; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T131–T138

---

## Phase 11 — Notifications (US7)

**Goal**: Deliver US7's full UI.

**Independent Test**: Sharing a project with a user produces a
notification they can see, mark read, and whose count updates.

- [ ] T140 [US7] `NotificationBell.tsx`
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/collaboration/components/NotificationBell.tsx`
  - **Goal**: A bell icon with an unread-count badge (`aria-live`
    region, Accessibility Phase 17 preview), sourced from
    `collaborationStore.unreadNotificationCount` (live) reconciled with
    `useNotifications`'s durable count on mount.
  - **Acceptance Criteria**: Matches FR-038.
  - **Verification**: Covered by T145.
  - **Dependencies**: T089, T101

- [ ] T141 [US7] `NotificationList.tsx`
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/collaboration/components/NotificationList.tsx`
  - **Goal**: A dropdown/panel listing `useNotifications()`, newest
    first, each with its type-specific message and a "mark read" action.
  - **Acceptance Criteria**: Matches FR-036/FR-037.
  - **Verification**: Covered by T145.
  - **Dependencies**: T089

- [ ] T142 [US7] Mark-read / mark-all-read UI actions
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/collaboration/components/NotificationList.tsx` (extended)
  - **Goal**: Per-item and "mark all read" actions calling
    `useMarkNotificationRead`/`useMarkAllNotificationsRead`.
  - **Acceptance Criteria**: Matches US7 scenario 2.
  - **Verification**: Covered by T145.
  - **Dependencies**: T089, T141

- [ ] T143 [US7] Real-time badge update wiring (UI consumption)
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/collaboration/components/NotificationBell.tsx` (extended)
  - **Goal**: Confirm the bell's badge updates immediately from Phase 8's
    already-wired realtime `notification` event, no polling/refresh
    needed.
  - **Acceptance Criteria**: Matches US7 scenario 1's live-arrival
    expectation.
  - **Verification**: Covered by T146.
  - **Dependencies**: T101, T115, T140

- [ ] T144 [US7] Notification filtering (by type / unread)
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/collaboration/components/NotificationList.tsx` (extended)
  - **Goal**: A filter control over the seven notification types and an
    unread-only toggle.
  - **Acceptance Criteria**: Filtering never marks anything read as a
    side effect.
  - **Verification**: Covered by T145.
  - **Dependencies**: T141

- [ ] T145 [US7] Component tests: `NotificationBell`/`NotificationList`
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/collaboration/__tests__/NotificationBell.test.tsx`, `NotificationList.test.tsx`
  - **Goal**: Rendering, mark-read/mark-all, filtering — against mocked
    `notificationService`.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- NotificationBell NotificationList` passes.
  - **Dependencies**: T140–T144

- [ ] T146 [US7] Integration test: live notification updates badge without refresh
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/collaboration/__tests__/notificationLive.integration.test.tsx`
  - **Goal**: Matches `quickstart.md` Section 8.
  - **Acceptance Criteria**: Covered.
  - **Verification**: `npm run test -- notificationLive.integration` passes.
  - **Dependencies**: T143

- [ ] T147 **Checkpoint** — Notifications quality gate
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: N/A
  - **Goal**: Confirm US7 is fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T146 pass; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T140–T146

---

## Phase 12 — Activity History (US4)

**Goal**: Deliver US4's full UI.

**Independent Test**: Performing a tracked action shows it at the top of
the project's Activity timeline with correct user/timestamp/action/target.

- [ ] T148 [US4] `ActivityTimeline.tsx`
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/collaboration/components/ActivityTimeline.tsx`
  - **Goal**: Renders `useActivity(projectId)`'s cursor-paginated list,
    newest first, each row showing user/timestamp/action/target.
  - **Acceptance Criteria**: Matches US4 scenario 1.
  - **Verification**: Covered by T153.
  - **Dependencies**: T087

- [ ] T149 [US4] Activity filters (action type / user)
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/collaboration/components/ActivityTimeline.tsx` (extended)
  - **Goal**: Filter controls over `action`/`userId`.
  - **Acceptance Criteria**: Filtering is a client-side view concern
    only — never mutates or hides data server-side.
  - **Verification**: Covered by T153.
  - **Dependencies**: T148

- [ ] T150 [US4] Pagination UI
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/collaboration/components/ActivityTimeline.tsx` (extended)
  - **Goal**: "Load more"/cursor-based pagination control, matching
    `database`'s existing paginated-list UI conventions.
  - **Acceptance Criteria**: Matches US4 scenario 3 (remains usable at
    large history size).
  - **Verification**: Covered by T153.
  - **Dependencies**: T148

- [ ] T151 [US4] Action-type icons
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/collaboration/components/ActivityTimeline.tsx` (extended)
  - **Goal**: A small icon per `action` type (create/edit/delete/import/
    export/share/permission_change/version_restore), reusing
    `lucide-react` (existing dependency, no new icon library).
  - **Acceptance Criteria**: Every one of the eight action types has a
    distinct icon.
  - **Verification**: Covered by T153.
  - **Dependencies**: T148

- [ ] T152 [US4] Grouping (by day)
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/collaboration/components/ActivityTimeline.tsx` (extended)
  - **Goal**: Groups consecutive same-day entries under a date header.
  - **Acceptance Criteria**: Grouping is presentation-only, never
    changes the underlying newest-first order.
  - **Verification**: Covered by T153.
  - **Dependencies**: T148

- [ ] T153 [US4] Component tests: `ActivityTimeline`
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/collaboration/__tests__/ActivityTimeline.test.tsx`
  - **Goal**: Rendering, filtering, pagination, icons, grouping.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- ActivityTimeline` passes.
  - **Dependencies**: T148–T152

- [ ] T154 **Checkpoint** — Activity History quality gate
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: N/A
  - **Goal**: Confirm US4 is fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T153 pass; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T148–T153

---

## Phase 13 — Version History (US5)

**Goal**: Deliver US5's full UI.

**Independent Test**: Save a version, make a further change, restore the
earlier version, confirm the intervening change's version is still
present in history.

- [ ] T155 [US5] `VersionHistoryPanel.tsx`
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/collaboration/components/VersionHistoryPanel.tsx`
  - **Goal**: Lists `useVersions(projectId)` (metadata only) newest
    first, with a "Save version" action (optional note field).
  - **Acceptance Criteria**: Matches US5 scenario 1.
  - **Verification**: Covered by T160.
  - **Dependencies**: T088

- [ ] T156 [US5] Restore-confirmation UI
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/collaboration/components/VersionHistoryPanel.tsx` (extended)
  - **Goal**: `AlertDialog`-confirmed restore action, warning that a
    safety snapshot will be taken first (transparent about FR-029's
    behavior, not a surprise).
  - **Acceptance Criteria**: Matches US5 scenario 4.
  - **Verification**: Covered by T160.
  - **Dependencies**: T088, T155

- [ ] T157 [US5] `VersionCompareView.tsx`
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/collaboration/components/VersionCompareView.tsx`
  - **Goal**: Selects two versions, renders `useCompareVersions`'s
    added/changed/removed summary.
  - **Acceptance Criteria**: Matches US5 scenario 3.
  - **Verification**: Covered by T160.
  - **Dependencies**: T088

- [ ] T158 [US5] Version-notes display/input
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/collaboration/components/VersionHistoryPanel.tsx` (extended)
  - **Goal**: Optional note field on save; displayed per version row.
  - **Acceptance Criteria**: A version saved with no note displays
    cleanly (no "undefined"/empty-string artifact).
  - **Verification**: Covered by T160.
  - **Dependencies**: T155

- [ ] T159 [US5] Automatic-snapshot indicator
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/collaboration/components/VersionHistoryPanel.tsx` (extended)
  - **Goal**: A visual badge distinguishing `isPreRestoreSnapshot: true`
    rows and pre-import auto-saves (004-map-editing-ui's import flow)
    from manual saves.
  - **Acceptance Criteria**: Matches US5 scenario 2.
  - **Verification**: Covered by T160.
  - **Dependencies**: T155

- [ ] T160 [US5] Component tests: `VersionHistoryPanel`/`VersionCompareView`
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/collaboration/__tests__/VersionHistoryPanel.test.tsx`, `VersionCompareView.test.tsx`
  - **Goal**: Save/list/restore-confirm/compare/notes/auto-snapshot
    indicator.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- VersionHistoryPanel VersionCompareView` passes.
  - **Dependencies**: T155–T159

- [ ] T161 [US5] Integration test: save → edit → restore → compare
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/collaboration/__tests__/versionHistory.integration.test.tsx`
  - **Goal**: Matches `quickstart.md` Section 6.
  - **Acceptance Criteria**: SC-007 explicitly asserted at the UI-
    integration level (version count only ever increases).
  - **Verification**: `npm run test -- versionHistory.integration` passes or skips cleanly.
  - **Dependencies**: T156

- [ ] T162 **Checkpoint** — Version History quality gate
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: N/A
  - **Goal**: Confirm US5 is fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T161 pass; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T155–T161

---

## Phase 14 — Offline Synchronization (US8)

**Goal**: Deliver US8's full UI and remaining client logic.

**Independent Test**: Disconnect, edit a feature, reconnect, confirm the
edit synchronizes with no re-entry required.

- [ ] T163 [US8] `OfflineStatusBanner.tsx`
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/collaboration/components/OfflineStatusBanner.tsx`
  - **Goal**: Shows current connectivity state
    (`collaborationStore.connectionStatus`) and a pending-edit count from
    `useOfflineQueue`.
  - **Acceptance Criteria**: Matches US8 scenario 1.
  - **Verification**: Covered by T169.
  - **Dependencies**: T092, T100

- [ ] T164 [US8] Queue-status UI detail
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/collaboration/components/OfflineStatusBanner.tsx` (extended)
  - **Goal**: Expandable detail listing each queued edit's status
    (queued/submitting/retrying/conflicted).
  - **Acceptance Criteria**: Reflects `offlineQueue.ts`'s statuses
    exactly.
  - **Verification**: Covered by T169.
  - **Dependencies**: T082, T163

- [ ] T165 [US8] Finalize retry-with-backoff in `offlineQueue.ts`
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/collaboration/services/offlineQueue.ts`
  - **Goal**: A failed submission (transient server error) retries with
    backoff rather than being dropped (FR-041).
  - **Acceptance Criteria**: Matches US8 scenario 3.
  - **Verification**: Covered by T169.
  - **Dependencies**: T082

- [ ] T166 [US8] Synchronization-on-reconnect wiring
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/collaboration/hooks/useOfflineQueue.ts` (extended)
  - **Goal**: `window.addEventListener("online", ...)` triggers an
    automatic, in-order queue drain — no member action required
    (FR-040).
  - **Acceptance Criteria**: Matches US8 scenario 2.
  - **Verification**: Covered by T170.
  - **Dependencies**: T092, T165

- [ ] T167 [US8] Conflict-detection integration
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/collaboration/hooks/useOfflineQueue.ts` (extended)
  - **Goal**: Each replayed edit carries its cached
    `featureExpectedUpdatedAt`; a `409` response marks that queue entry
    `"conflicted"` rather than retrying it forever.
  - **Acceptance Criteria**: Matches US8 scenario 4 / research.md
    Decision 5.
  - **Verification**: Covered by T170.
  - **Dependencies**: T063, T092, T166

- [ ] T168 [US8] `ConflictResolutionDialog.tsx`
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/collaboration/components/ConflictResolutionDialog.tsx`
  - **Goal**: Surfaces a `"conflicted"` queue entry's local vs. server
    version side by side, letting the member choose which to keep or
    manually merge — never auto-resolves (spec Assumptions).
  - **Acceptance Criteria**: Matches US8 scenario 4's "never silently
    discard" requirement exactly.
  - **Verification**: Covered by T169.
  - **Dependencies**: T167

- [ ] T169 [US8] Hook/unit tests: offline queue retry/backoff/ordering
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/collaboration/__tests__/offlineQueue.test.ts`
  - **Goal**: Retry-with-backoff, in-order replay, conflict marking, and
    `OfflineStatusBanner`/`ConflictResolutionDialog` rendering.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- offlineQueue` passes.
  - **Dependencies**: T163–T168

- [ ] T170 [US8] Integration test: offline → reconnect → sync; offline → conflict → surfaced
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/collaboration/__tests__/offlineSync.integration.test.tsx`
  - **Goal**: Matches `quickstart.md` Section 9, both the clean-
    reconnect and the conflicting-edit paths.
  - **Acceptance Criteria**: Neither path ever silently loses or
    silently overwrites an edit.
  - **Verification**: `npm run test -- offlineSync.integration` passes or skips cleanly.
  - **Dependencies**: T166, T167, T168

- [ ] T171 **Checkpoint** — Offline Synchronization quality gate
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: N/A
  - **Goal**: Confirm US8 is fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T170 pass or skip cleanly; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T163–T170

---

## Phase 15 — Presence (US9)

**Goal**: Deliver US9's full UI.

**Independent Test**: Two members open the same project; each sees the
other listed as active with an approximate cursor/map view.

- [ ] T172 [US9] `PresenceIndicator.tsx`
  - **Priority**: P9
  - **User Story**: US9
  - **Files**: `src/features/collaboration/components/PresenceIndicator.tsx`
  - **Goal**: Renders `collaborationStore.activePresence` as a list of
    avatars/initials, one per active member.
  - **Acceptance Criteria**: Matches US9 scenario 1.
  - **Verification**: Covered by T177.
  - **Dependencies**: T098

- [ ] T173 [US9] Live cursor rendering on the map
  - **Priority**: P9
  - **User Story**: US9
  - **Files**: `src/features/collaboration/components/PresenceIndicator.tsx` (extended, rendered inside `MapEditingLayer`)
  - **Goal**: Each active member's `cursorLng`/`cursorLat` rendered as a
    small labeled marker.
  - **Acceptance Criteria**: Matches US9 scenario 2.
  - **Verification**: Covered by T177.
  - **Dependencies**: T098, T172

- [ ] T174 [US9] Live viewport indicator
  - **Priority**: P9
  - **User Story**: US9
  - **Files**: `src/features/collaboration/components/PresenceIndicator.tsx` (extended)
  - **Goal**: Each active member's `viewportBounds` rendered as a subtle
    outline/indicator (e.g., a minimap-style rectangle), reusing
    `react-leaflet`'s existing `Rectangle` component (004's precedent).
  - **Acceptance Criteria**: Matches US9 scenario 3.
  - **Verification**: Covered by T177.
  - **Dependencies**: T098, T172

- [ ] T175 [US9] Editing-indicator (ties to `LockBadge`)
  - **Priority**: P9
  - **User Story**: US9
  - **Files**: `src/features/collaboration/components/LockBadge.tsx`
  - **Goal**: Shows which feature (if any) each active member is
    currently editing, consistent with `FeatureLock` state
    (`collaborationStore.activeLocks`) — the same underlying state as
    US3's lock indicator, viewed from the presence angle.
  - **Acceptance Criteria**: Matches US9 scenario 4 / US3 scenario 1 —
    the two indicators never disagree, since both read the same store
    slice.
  - **Verification**: Covered by T177.
  - **Dependencies**: T099

- [ ] T176 [US9] Disconnect-timeout display behavior
  - **Priority**: P9
  - **User Story**: US9
  - **Files**: `src/features/collaboration/components/PresenceIndicator.tsx` (extended)
  - **Goal**: A presence entry is removed from the displayed list once
    its `lastSeenAt` exceeds the 30 s timeout (research.md Decision 3) —
    a client-side display concern layered on top of the server's own
    read-time filtering (T062/T030), providing a smooth countdown/fade
    rather than an abrupt jump.
  - **Acceptance Criteria**: Matches US9 scenario 5 / SC-006.
  - **Verification**: Covered by T177.
  - **Dependencies**: T172

- [ ] T177 [US9] Component tests: `PresenceIndicator`/`LockBadge`
  - **Priority**: P9
  - **User Story**: US9
  - **Files**: `src/features/collaboration/__tests__/PresenceIndicator.test.tsx`, `LockBadge.test.tsx`
  - **Goal**: Avatar list, cursor, viewport, editing indicator,
    disconnect-timeout display.
  - **Acceptance Criteria**: All covered.
  - **Verification**: `npm run test -- PresenceIndicator LockBadge` passes.
  - **Dependencies**: T172–T176

- [ ] T178 [US9] Integration test: two-session presence + disconnect timeout
  - **Priority**: P9
  - **User Story**: US9
  - **Files**: `src/features/collaboration/__tests__/presence.integration.test.tsx`
  - **Goal**: Matches `quickstart.md` Section 10.
  - **Acceptance Criteria**: SC-006 explicitly asserted.
  - **Verification**: `npm run test -- presence.integration` passes or skips cleanly.
  - **Dependencies**: T176

- [ ] T179 **Checkpoint** — Presence quality gate
  - **Priority**: P9
  - **User Story**: US9
  - **Files**: N/A
  - **Goal**: Confirm US9 is fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T178 pass or skip cleanly; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T172–T178

---

## Phase 16 — UI Components (Shell Integration)

**Purpose**: Wire every Phase 9–15 component into the actual dashboard/
map shell, plus the two cross-cutting dialogs (permission, conflict)
that don't belong to a single user story.

- [ ] T180 Integrate `MemberList`/`InviteDialog` into `RightSidebar`
  - **Priority**: Must-have
  - **User Story**: None (cross-cutting integration)
  - **Files**: `src/features/dashboard/components/RightSidebar.tsx` (004-map-editing-ui) — or wherever US1's plan.md Component Hierarchy targets
  - **Goal**: New "Members" section alongside the existing `LayerTree`,
    without disrupting existing sidebar layout/behavior (same additive-
    integration discipline as 004's own `RightSidebar` build).
  - **Acceptance Criteria**: Existing `LayerTree` functionality
    unaffected.
  - **Verification**: Covered by T188.
  - **Dependencies**: T121, T122

- [ ] T181 Integrate `ActivityTimeline`/`VersionHistoryPanel` into `RightSidebar`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `RightSidebar.tsx`
  - **Goal**: Additional collapsible sections, same pattern as T180.
  - **Acceptance Criteria**: No regression to existing sections.
  - **Verification**: Covered by T188.
  - **Dependencies**: T148, T155

- [ ] T182 Integrate `NotificationBell`/`NotificationList` into the shell
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboard/components/Navbar.tsx` (001-app-foundation) or equivalent top-level chrome location
  - **Goal**: Bell icon in the existing navbar, opening the notification
    panel — additive, not a redesign of the navbar.
  - **Acceptance Criteria**: Existing navbar controls unaffected.
  - **Verification**: Covered by T188.
  - **Dependencies**: T140, T141

- [ ] T183 Integrate `PresenceIndicator`/`LockBadge`/`CommentThread` into `MapEditingLayer`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/database/components/MapEditingLayer.tsx` (004-map-editing-ui)
  - **Goal**: Same overlay-composition pattern `FeatureContextMenu`
    already uses — additive children, no change to existing toolbar/
    layer rendering.
  - **Acceptance Criteria**: Existing `MapEditingLayer` behavior (T088/
    T089 from 004) unaffected.
  - **Verification**: Covered by T188.
  - **Dependencies**: T172, T175, T131

- [ ] T184 Integrate `OfflineStatusBanner` into `MapEditingLayer`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `MapEditingLayer.tsx`
  - **Goal**: Same overlay corner convention as `EditingErrorBanner`
    (004), positioned to not overlap it.
  - **Acceptance Criteria**: Both banners can be visible simultaneously
    without overlapping.
  - **Verification**: Covered by T188.
  - **Dependencies**: T163

- [ ] T185 Integrate `ConflictResolutionDialog` as a shell-level modal
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/dashboard/components/DashboardLayout.tsx` (001-app-foundation)
  - **Goal**: Mounted once at the shell level, triggered by either the
    lock-conflict or offline-sync-conflict path (both funnel into the
    same dialog, per plan.md's Component Hierarchy).
  - **Acceptance Criteria**: A lock `409` and an offline-sync `409` both
    open this same dialog, not two different ones.
  - **Verification**: Covered by T188.
  - **Dependencies**: T168, T090

- [ ] T186 `PermissionDialog.tsx` polish pass
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/components/PermissionDialog.tsx`
  - **Goal**: Finalize the standalone dialog version of T126's inline
    role-change control, for use from both `MemberList` and any future
    entry point.
  - **Acceptance Criteria**: No duplicate role-change logic between the
    inline and dialog versions — one shared hook (`useChangeRole`)
    backs both.
  - **Verification**: Covered by T188.
  - **Dependencies**: T126

- [ ] T187 Dark-mode/theme consistency pass
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: Every component under `src/features/collaboration/components/`
  - **Goal**: Confirm every new component renders correctly in both
    light and dark mode, using only existing Tailwind/shadcn theme
    tokens (no new color system).
  - **Acceptance Criteria**: No component hardcodes a light-only or
    dark-only color.
  - **Verification**: Manual visual review (or automated snapshot if
    the project's existing tooling supports it).
  - **Dependencies**: T180–T186

- [ ] T188 Component integration test: full `RightSidebar` with all sections
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/__tests__/shellIntegration.test.tsx`
  - **Goal**: Renders `RightSidebar`/`MapEditingLayer`/`DashboardLayout`
    with every new section present, confirming no regression to any
    existing 001/003/004/005 component test.
  - **Acceptance Criteria**: Every existing shell-related test (e.g.,
    004's `DashboardLayout.test.tsx`) still passes unmodified.
  - **Verification**: `npm run test -- shellIntegration` and the full
    existing dashboard/map test suites, both passing.
  - **Dependencies**: T180–T187

- [ ] T189 **Checkpoint** — UI Components quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm every new UI surface is correctly integrated into
    the existing shell with zero regression.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; tests
    through T188 pass; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T180–T188

---

## Phase 17 — Accessibility

**Purpose**: A dedicated accessibility pass across every component from
Phases 9–16, per Constitution Principle VII and the Additional
Engineering Standards.

- [ ] T190 Keyboard navigation audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Every component under `src/features/collaboration/components/`
  - **Goal**: Confirm every interactive control (buttons, role selectors,
    dialogs, comment composer, notification actions) is reachable and
    operable via keyboard alone.
  - **Acceptance Criteria**: No control requires a mouse to activate.
  - **Verification**: Manual/code review, same convention as 004/005's
    accessibility passes (no axe dependency added — see Notes below).
  - **Dependencies**: T180–T188

- [ ] T191 ARIA roles/labels audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Same as T190
  - **Goal**: Every icon-only control has an `aria-label`; live-updating
    regions (`NotificationBell`'s count, `PresenceIndicator`'s list,
    `ActivityTimeline`'s new entries) use `aria-live="polite"`, matching
    the Constitution's explicit requirement for live-updating regions.
  - **Acceptance Criteria**: Matches the pattern already established by
    `MeasurementToolbar`'s `role="status"` live region (004).
  - **Verification**: Manual/code review.
  - **Dependencies**: T180–T188

- [ ] T192 Focus management audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `InviteDialog.tsx`, `ConflictResolutionDialog.tsx`, `PermissionDialog.tsx`, every `AlertDialog` usage
  - **Goal**: Confirm focus moves into each dialog on open and returns to
    the triggering control on close (Radix `Dialog`/`AlertDialog`'s
    built-in behavior, verified not overridden incorrectly).
  - **Acceptance Criteria**: No dialog traps focus incorrectly or loses
    it on close.
  - **Verification**: Manual/code review.
  - **Dependencies**: T122, T168, T186

- [ ] T193 Screen reader label pass
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Same as T190
  - **Goal**: Every form field (invite role selector, comment composer,
    version note input) has a programmatically-associated label.
  - **Acceptance Criteria**: No field relies on placeholder text alone
    as its label.
  - **Verification**: Manual/code review.
  - **Dependencies**: T180–T188

- [ ] T194 Color-contrast verification
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `LockBadge.tsx`, `PresenceIndicator.tsx`, `NotificationBell.tsx`
  - **Goal**: Confirm lock badges, presence avatars, and notification
    badges meet WCAG 2.2 AA contrast in both light and dark mode
    (building on T187's theme pass).
  - **Acceptance Criteria**: No text/icon combination falls below the AA
    contrast ratio.
  - **Verification**: Manual review against the project's existing
    Tailwind theme tokens (already AA-compliant per prior features'
    precedent).
  - **Dependencies**: T187

- [ ] T195 Accessibility verification pass (axe-equivalent)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (audit across all Phase 9–16 components)
  - **Goal**: A systematic, manual-review-based audit consolidating
    T190–T194's findings — this project has no `axe-core`/`jest-axe`
    dependency (confirmed absent, matching 004/005's same finding), so
    verification is via structured code review, not an automated tool
    run.
  - **Acceptance Criteria**: Zero critical/serious findings remain
    unresolved.
  - **Verification**: Findings documented; any real issue fixed in T196.
  - **Dependencies**: T190–T194

- [ ] T196 Fix any findings from T190–T195
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Whichever component(s) T195 flagged
  - **Goal**: Apply concrete fixes for every real finding (e.g., the
    `role="button"`/nested-interactive-element class of bug found and
    fixed during 004's own accessibility audit is the kind of issue this
    task exists to catch here too).
  - **Acceptance Criteria**: Re-running T195's review shows zero
    remaining findings.
  - **Verification**: Manual re-review.
  - **Dependencies**: T195

- [ ] T197 **Checkpoint** — Accessibility quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the full feature meets WCAG 2.2 AA across every
    new component.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; T195's audit
    shows zero remaining findings; `next build` succeeds.
  - **Verification**: Commands run clean; audit re-confirmed.
  - **Dependencies**: T190–T196

---

## Phase 18 — Testing (Consolidation & Gap-Filling)

**Purpose**: A cross-cutting pass confirming every test tier from every
earlier phase forms one coherent, complete suite — not new functionality,
verification that nothing was missed.

- [ ] T198 Full repository test suite consolidated run + gap analysis
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/*`
  - **Goal**: Run every repository test from Phase 3 together; confirm
    every exported function from every new repository file has at least
    one direct test.
  - **Acceptance Criteria**: 100% of new repository exports referenced.
  - **Verification**: `npm run test -- src/server/repositories` passes or skips cleanly.
  - **Dependencies**: T034–T042

- [ ] T199 Full Route Handler test suite consolidated run + gap analysis
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/**/__tests__/*`
  - **Goal**: Run every API test from Phase 4 together; confirm every
    one of the ~21 endpoints plus the two extended existing ones has at
    least a success, a role/ownership-rejection, and (where applicable)
    a conflict-path test. Also runs the query-key/store-boundary
    architecture guard (matching 005's `architectureConventions.test.ts`
    precedent) scoped to this feature's new files.
  - **Acceptance Criteria**: 100% endpoint coverage per the above;
    zero inline query-key literals; zero direct `.setState()` calls from
    a component.
  - **Verification**: `npm run test -- app/api` passes or skips cleanly.
  - **Dependencies**: T065–T070

- [ ] T200 Full hook test suite consolidated run + gap analysis
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/__tests__/use*.test.tsx`
  - **Goal**: Confirm every hook from Phase 6 has coverage for its
    success and error paths.
  - **Acceptance Criteria**: 100% of new hooks referenced.
  - **Verification**: `npm run test -- src/features/collaboration/__tests__` (hook subset) passes.
  - **Dependencies**: T094–T096

- [ ] T201 Full store test suite consolidated run + gap analysis
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/__tests__/collaborationStore.test.ts`
  - **Goal**: Confirm 100% of `collaborationStore`'s exported actions are
    directly referenced (matching the completeness standard 004/005 set
    for `editingStore`/`databaseStore`).
  - **Acceptance Criteria**: 100% coverage.
  - **Verification**: `npm run test -- collaborationStore` passes.
  - **Dependencies**: T104

- [ ] T202 Full WebSocket/SSE test suite consolidated run + gap analysis
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/__tests__/stream.api.test.ts`, `src/features/collaboration/__tests__/realtimeClient.test.ts`
  - **Goal**: Confirm every one of the six broadcast event types
    (feature/layer/presence/lock/comment/notification) has both a
    server-side `publish()` test and a client-side dispatch test.
  - **Acceptance Criteria**: 6/6 event types covered on both sides.
  - **Verification**: `npm run test -- stream.api realtimeClient` passes.
  - **Dependencies**: T117, T118

- [ ] T203 Full integration test suite consolidated run + gap analysis
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/__tests__/*.integration.test.tsx`
  - **Goal**: Confirm all nine user stories' integration tests
    (T129/T138/T146/T153-adjacent/T161/T170/T178/T119) collectively cover
    every `quickstart.md` section.
  - **Acceptance Criteria**: Every `quickstart.md` section (2–10) has a
    corresponding automated integration test, not manual-only.
  - **Verification**: `npm run test -- integration` passes or skips cleanly.
  - **Dependencies**: T119, T129, T138, T146, T161, T170, T178

- [ ] T204 Accessibility test consolidation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Cross-reference T197's Accessibility checkpoint against
    this consolidated testing pass — confirm no new component landed
    after T197 without its own accessibility review.
  - **Acceptance Criteria**: Every component in the final `git diff` for
    this feature is accounted for in T190–T196's audit.
  - **Verification**: Manual cross-reference.
  - **Dependencies**: T197

- [ ] T205 Performance test suite verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (references Phase 19's actual performance tasks)
  - **Goal**: Confirm the performance test tasks Phase 19 defines
    (T213–T214) exist and are wired to run in this consolidated pass —
    a scheduling/completeness check, not new performance work itself.
  - **Acceptance Criteria**: Both performance tests present and passing
    (or explicitly BLOCKED with reason, e.g., no environment capable of
    a real 100-connection load test).
  - **Verification**: Cross-reference against Phase 19.
  - **Dependencies**: T213, T214

- [ ] T206 Security regression suite: full cross-owner/role sweep
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/__tests__/collaboration.security.test.ts` (T070, re-run consolidated)
  - **Goal**: Re-run T070's security spot-check as part of this final
    consolidation, confirming it still covers every endpoint that exists
    by this point in the feature (including any added after Phase 4,
    e.g., none expected, but explicitly checked).
  - **Acceptance Criteria**: 100% endpoint coverage confirmed current.
  - **Verification**: `npm run test -- collaboration.security` passes or skips cleanly.
  - **Dependencies**: T070

- [ ] T207 **Checkpoint** — Testing quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the entire feature's test suite is complete and
    green as one whole.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; the full
    project test suite (`npm run test`) passes with zero failures (DB-
    dependent tests pass or skip cleanly, never silently "pass" when
    they didn't run); `next build` succeeds.
  - **Verification**: `npm run test` full run; `next build`.
  - **Dependencies**: T198–T206

---

## Phase 19 — Performance

**Purpose**: Verify the plan.md-stated performance targets (100
concurrent editors, 50,000 features, 100 projects) are actually met, and
apply any optimization the verification reveals is needed.

- [ ] T208 [P] React re-render optimization pass
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `PresenceIndicator.tsx`, `CommentThread.tsx`, `ActivityTimeline.tsx`
  - **Goal**: Memoize per-item rendering (`React.memo` keyed by id +
    `updatedAt`/`lastSeenAt`, matching `FeatureLayerItem`'s existing
    004 precedent) for the three components most exposed to high-
    frequency realtime updates.
  - **Acceptance Criteria**: A presence heartbeat from one member does
    not re-render every other member's list item.
  - **Verification**: Covered by T212.
  - **Dependencies**: T172, T131, T148

- [ ] T209 [P] Query optimization pass
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/hooks/*.ts`
  - **Goal**: Confirm every list query uses appropriate `staleTime`/
    `gcTime` given its update frequency (e.g., Activity can cache longer
    than Presence, which is realtime-driven and needs none).
  - **Acceptance Criteria**: No query refetches more often than its data
    actually changes via non-realtime paths.
  - **Verification**: Manual review.
  - **Dependencies**: T084–T092

- [ ] T210 [P] Database optimization pass
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (index review only, no schema
    change expected)
  - **Goal**: `EXPLAIN ANALYZE` spot-check on `Activity`/`Version`/
    `Comment`/`Notification` list queries at a seeded 50,000-feature/
    large-history scale, confirming data-model.md's indexes are actually
    used (not sequential-scanned).
  - **Acceptance Criteria**: Every list query's plan shows index usage.
  - **Verification**: Manual `EXPLAIN ANALYZE` review against the real
    test database, or BLOCKED if unavailable.
  - **Dependencies**: T019

- [ ] T211 List virtualization: `ActivityTimeline`/`NotificationList`
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `ActivityTimeline.tsx`, `NotificationList.tsx`
  - **Goal**: Virtualize rendering for large lists (matching
    `database`'s own precedent of favoring pagination over unbounded
    DOM growth) — only render visible rows.
  - **Acceptance Criteria**: A 10,000-row Activity list renders without
    a full-DOM-size performance cliff.
  - **Verification**: Covered by T214.
  - **Dependencies**: T148, T141

- [ ] T212 Memoization verification
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: Same as T208
  - **Goal**: Confirm T208's memoization actually prevents unnecessary
    re-renders under a simulated rapid-heartbeat scenario (a React
    Profiler-based or render-count-spy assertion, matching 004's planned
    `renderPerformance.test.tsx` approach).
  - **Acceptance Criteria**: Render count stays proportional to changed
    items, not total items.
  - **Verification**: `npm run test -- renderPerformance` (or
    equivalent) passes.
  - **Dependencies**: T208

- [ ] T213 [P] Performance test: 100-concurrent-SSE-connection load
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/__tests__/streamPerformance.test.ts`
  - **Goal**: Simulate 100 concurrent SSE connections against one
    project's stream endpoint; confirm the server remains responsive and
    SC-002's 5-second propagation budget holds.
  - **Acceptance Criteria**: Matches plan.md's stated 100-concurrent-
    editor target.
  - **Verification**: `npm run test -- streamPerformance` passes, or
    BLOCKED with reason if this environment cannot realistically open
    100 concurrent connections (e.g., sandboxed/local-only execution).
  - **Dependencies**: T107

- [ ] T214 [P] Performance test: 50,000-feature project list timing
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/scalePerformance.test.ts`
  - **Goal**: Seed a 50,000-feature project (or a representative
    fraction with extrapolation, if seeding the full volume isn't
    practical in this environment) and time Activity/Version/Comment
    list pagination.
  - **Acceptance Criteria**: Matches plan.md's stated 50,000-feature
    target; results documented even if extrapolated.
  - **Verification**: `npm run test -- scalePerformance` passes or is
    BLOCKED with reason.
  - **Dependencies**: T019, T026, T027

- [ ] T215 Bundle verification: `pg` stays server-only
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (build output inspection)
  - **Goal**: Confirm `next build`'s client bundle contains no trace of
    `pg` — it is only ever imported from `src/server/realtime/channel.ts`
    and repository files, never a client component/hook/store.
  - **Acceptance Criteria**: Zero client-bundle impact from this
    feature's one new dependency.
  - **Verification**: `next build` output review (or
    `ANALYZE=true npm run build` if bundle-analyzer is configured, per
    004/005's precedent).
  - **Dependencies**: T013

- [ ] T216 **Checkpoint** — Performance quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm every stated performance target is met or its gap
    explicitly documented as BLOCKED, not silently assumed.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint` clean; T213/T214
    pass or are explicitly BLOCKED with reason; `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T208–T215

---

## Phase 20 — Documentation

**Purpose**: The full documentation set Constitution Principle VIII
requires, plus the final production-readiness gate.

- [ ] T217 [P] Feature README
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/README.md`
  - **Goal**: Document purpose, public API (barrel exports), a usage
    example per user story, and known limitations (in-app-only
    notifications, no email/push; offline conflicts always surfaced,
    never auto-merged; 15 min lock timeout, 30 s presence timeout; no
    background job queue — presence/lock expiry are read-time checks).
  - **Acceptance Criteria**: Every limitation from `plan.md`'s
    Constraints/Risks is called out explicitly.
  - **Verification**: Manual review.
  - **Dependencies**: T001–T216

- [ ] T218 [P] Deployment documentation
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (existing file, extended)
  - **Goal**: Add this feature's Vercel/Railway/Docker/AWS considerations
    from `plan.md`'s Deployment section — the SSE/Fluid-Compute
    requirement and the per-instance `LISTEN` connection count, in
    particular.
  - **Acceptance Criteria**: Matches `plan.md` exactly; no
    contradiction with existing deployment docs for 001–005.
  - **Verification**: Manual review.
  - **Dependencies**: T107

- [ ] T219 [P] Architecture documentation
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/architecture.md` (new or extended, matching
    project convention)
  - **Goal**: Document the realtime (SSE + `LISTEN`/`NOTIFY`) diagram
    from `plan.md`'s Architecture section, and the broadened-ownership-
    check design from research.md Decision 10.
  - **Acceptance Criteria**: A future contributor can understand the
    fan-out architecture without reading `research.md` directly.
  - **Verification**: Manual review.
  - **Dependencies**: T107, T031–T033

- [ ] T220 [P] API documentation
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/api.md` (new or extended, matching project
    convention) or a reference pointing to `contracts/api-contracts.md`
  - **Goal**: Summarize every new endpoint's purpose, request/response
    shape, and error codes for external reference.
  - **Acceptance Criteria**: Matches `contracts/api-contracts.md`
    exactly; no drift between the two.
  - **Verification**: Manual review.
  - **Dependencies**: T044–T064

- [ ] T221 [P] Developer guide
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/collaboration/README.md` (extended) or a
    dedicated `CONTRIBUTING`-style section
  - **Goal**: A short guide for extending this feature — how to add a
    new realtime event type (touch `channel.ts`'s publish call sites +
    `realtimeClient.ts`'s dispatch map), and how to add a new role check
    (`assertProjectRole`'s usage pattern).
  - **Acceptance Criteria**: A future contributor can add a new
    broadcast event type by following this guide alone.
  - **Verification**: Manual review.
  - **Dependencies**: T013, T012

- [ ] T222 Full `quickstart.md` run-through
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (manual walkthrough against `quickstart.md`)
  - **Goal**: Execute every section of `quickstart.md` end to end
    against a real running instance with two seeded users.
  - **Acceptance Criteria**: Every item in `quickstart.md`'s Production
    Readiness Checklist passes.
  - **Verification**: Manual run-through; mark BLOCKED for any step
    requiring browser/Docker/multi-instance-deployment tooling
    unavailable in this environment, per the convention established
    throughout 004/005's implementation.
  - **Dependencies**: T001–T221

- [ ] T223 Constitution Check re-verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `specs/006-collaboration/plan.md`
  - **Goal**: Re-confirm every principle in `plan.md`'s Constitution
    Check table against the as-built code, including the one explicitly
    noted extension (broadened ownership helpers) — confirm it remains
    scoped exactly as documented, with no further existing-code drift.
  - **Acceptance Criteria**: No undocumented deviation found; the one
    documented extension's Complexity Tracking entry still accurately
    describes the as-built change.
  - **Verification**: Manual review against `plan.md`.
  - **Dependencies**: T001–T222

- [ ] T224 **Final quality gate** — full-suite production readiness
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: The final gate before this feature is considered done:
    every phase's checkpoint has passed, every `quickstart.md` item is
    checked or explicitly BLOCKED with reason, and the full project
    (001–006) test suite passes together as one whole.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, the full test
    suite (`npm run test`), and `next build` all pass with zero
    failures; documentation (T217–T221) complete; `quickstart.md`
    (T222) and Constitution Check (T223) both confirmed.
  - **Verification**: `npm run test` full run; `next build`; manual
    documentation/checklist review.
  - **Dependencies**: T001–T223

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundation)**: No dependencies — start immediately.
- **Phase 2 (Database)**: Depends on Phase 1 (needs `ForbiddenError`/
  `ConflictError` conceptually referenced, though not strictly blocking
  at the schema level) — practically, start after T001–T004.
- **Phase 3 (Repository Layer)**: Depends on Phase 2 (needs the
  generated Prisma Client) and Phase 1 (needs `assertProjectRole`,
  error classes).
- **Phase 4 (Route Handlers)**: Depends on Phase 3 (needs every
  repository function).
- **Phase 5 (Client Services)**: Depends on Phase 4 (needs every
  endpoint to wrap).
- **Phase 6 (React Query Hooks)**: Depends on Phase 5.
- **Phase 7 (Zustand Stores)**: Depends on Phase 1 (types) and Phase 5
  (`realtimeClient`) — largely parallel with Phase 6.
- **Phase 8 (Real-Time Collaboration)**: Depends on Phases 3–7 (needs
  real repository functions to publish from, and the client store/hooks
  to consume events) — this is the integration phase tying everything
  before it together.
- **Phases 9–15 (per-user-story UI)**: All depend on Phase 8 completing
  (every story's UI needs the full backend + realtime + client-state
  layer). Phases 9–15 can then proceed in parallel with each other,
  since each touches its own component files exclusively (Phase 16
  reconciles them into the shared shell afterward).
- **Phase 16 (UI Components/Shell Integration)**: Depends on Phases
  9–15 (needs every component to exist before wiring it into the shell).
- **Phase 17 (Accessibility)**: Depends on Phase 16.
- **Phase 18 (Testing)**: Depends on Phase 17 (consolidates every prior
  tier).
- **Phase 19 (Performance)**: Depends on Phase 18 (verifies the now-
  complete, now-fully-tested feature).
- **Phase 20 (Documentation)**: Depends on Phase 19 — the final phase.

### User Story Dependencies

- **US1 (P1, Phase 9)**: Depends on Phase 8 only — no dependency on any
  other user story's UI.
- **US6 (P6, Phase 10)**: Depends on Phase 8 only.
- **US7 (P7, Phase 11)**: Depends on Phase 8 only (though its
  integration test in T138 also exercises US6's mention flow — the two
  remain independently deliverable).
- **US4 (P4, Phase 12)**: Depends on Phase 8 only.
- **US5 (P5, Phase 13)**: Depends on Phase 8 only.
- **US8 (P8, Phase 14)**: Depends on Phase 8 only.
- **US9 (P9, Phase 15)**: Depends on Phase 8 only (shares its
  `LockBadge` component with US3's lock-indicator concept, both reading
  the same `collaborationStore` slice — not a UI-level dependency on a
  separate "US3 phase," since Feature Locking's own UI indicator is
  delivered here, in Phase 15, rather than as its own separate phase,
  per the user's 20-phase structure not allocating US3 its own numbered
  UI phase).

### Parallel Opportunities

- Every `[P]`-marked task within Phase 1 (T002–T011, T014) can run in
  parallel.
- Every new repository file in Phase 3 (T023–T030) can be built in
  parallel; the three broadened-helper tasks (T031–T033) must wait for
  T023 (needs `ProjectMember`) and T029 (needs `FeatureLock`).
- Every new endpoint in Phase 4 (T044–T062) can be built in parallel
  once its underlying repository function exists.
- Every service in Phase 5 (T072–T079) can be built in parallel.
- Every hook in Phase 6 (T084–T091) can be built in parallel.
- Every store slice in Phase 7 (T098–T101) can be built in parallel
  (all in the same file, but logically independent slices).
- **The biggest opportunity**: once Phase 8 completes, **Phases 9–15
  (all seven per-story UI phases) can proceed fully in parallel** — each
  touches its own component files exclusively, with Phase 16 as the
  single later reconciliation point.

---

## Parallel Example: Phase 3 (Repository Layer)

```bash
# Launch all eight new repository files together:
Task: "membershipRepository.ts in src/server/repositories/membershipRepository.ts"
Task: "invitationRepository.ts in src/server/repositories/invitationRepository.ts"
Task: "commentRepository.ts in src/server/repositories/commentRepository.ts"
Task: "activityRepository.ts in src/server/repositories/activityRepository.ts"
Task: "versionRepository.ts in src/server/repositories/versionRepository.ts"
Task: "notificationRepository.ts in src/server/repositories/notificationRepository.ts"
Task: "featureLockRepository.ts in src/server/repositories/featureLockRepository.ts"
Task: "presenceRepository.ts in src/server/repositories/presenceRepository.ts"
```

---

## Implementation Strategy

### MVP First (Phases 1–8 + US1 Only)

1. Complete Phases 1–8 (Foundation through Real-Time Collaboration) —
   the full backend, realtime, and client-state layer, shared by every
   story.
2. Complete Phase 9 (Project Sharing, US1) — the gateway capability.
3. **STOP and VALIDATE**: run `quickstart.md` Section 2 independently.
4. Deploy/demo if ready — sharing + live presence/lock infrastructure
   already delivers real collaborative value even before Comments/
   Notifications/Version History/Offline/Activity ship.

### Incremental Delivery

1. Phases 1–8 → shared foundation ready.
2. Phase 9 (US1) → test independently → deploy/demo (MVP!).
3. Phases 10–15 (US6, US7, US4, US5, US8, US9) in any order, each
   independently testable → deploy/demo after each.
4. Phase 16 → reconcile every story's UI into one coherent shell.
5. Phases 17–20 → accessibility, testing consolidation, performance,
   documentation → final release.

### Parallel Team Strategy

With multiple developers, once Phase 8 is done:
- Developer A: Phase 9 (US1, the critical path)
- Developer B: Phase 10 + 11 (US6, US7 — comments and notifications are
  closely related)
- Developer C: Phase 12 + 13 (US4, US5 — both history-oriented)
- Developer D: Phase 14 + 15 (US8, US9 — the two most infrastructure-
  heavy remaining stories)
- All converge on Phase 16 together.

---

## Notes

- [P] tasks = different files (or independent, logically-separate slices
  of the same file), no unresolved dependency.
- [Story] label maps a Phase 9–15 task to its user story for
  traceability; Phases 1–8 and 16–20 are shared/cross-cutting and carry
  no story label, per the Task Generation Rules.
- Every phase ends with a Checkpoint (or, for Phase 20, a Final Quality
  Gate) verifying TypeScript, ESLint, the applicable test tiers, the
  production build, and — where relevant — documentation completeness.
- Phase 7 deliberately does **not** build six separate stores despite
  the six names in the original phase outline — see the Scope Note at
  the top of Phase 7 for why "Comment Store" and "Clipboard Store" would
  have violated this task list's own "never duplicate code" and the
  Constitution's shadow-cache prohibition.
- If verification cannot be completed because of Docker, browser
  tooling, multi-instance deployment infrastructure, or a live database,
  mark the task BLOCKED explicitly rather than claiming success —
  matching the convention already established during
  `004-map-editing-ui` and `005-spatial-analysis-geoprocessing`'s
  implementations.
