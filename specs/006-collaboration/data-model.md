# Data Model: Real-Time Collaboration

**Feature**: 006-collaboration
**Date**: 2026-07-23

This extends the persisted data model established by 003-database-
foundation (`User → Project → Layer → Feature`) and 005-spatial-analysis-
geoprocessing (`AnalysisRun`) with eight new Prisma models — the seven
explicitly requested (`ProjectMember`, `Comment`, `Activity`, `Version`,
`Notification`, `FeatureLock`, `Presence`) plus `Invitation`, which
FR-010–FR-012 require and which none of the seven above can represent —
and additive back-relations on the three existing models. It intentionally
does not include literal `schema.prisma` syntax or migration SQL, which
belong to the implementation phase. See research.md Decision 10 for the
one place this feature also narrowly modifies existing repository query
logic (not schema) to recognize non-owner access.

---

## Schema Organization

The eight new models are declared after `Feature`/`AnalysisRun`, in
dependency order. `Project` gains back-relations to `ProjectMember`,
`Activity`, `Version`, and `Invitation`; `Feature` gains back-relations to
`Comment` and `FeatureLock`; `User` gains back-relations to all eight
where it participates. No existing model's own fields, indexes, or
cascade behavior change.

**Attribution vs. membership — two different cascade rules, used
deliberately throughout this document**:
- Rows that grant *live access or state* (`ProjectMember`, `FeatureLock`,
  `Presence`, `Notification`) cascade-delete when their `User` is
  deleted — a removed user should hold no locks, no presence, no pending
  notifications, and no membership (Edge Cases: deleted users).
- Rows that are a *historical record* (`Activity`, `Comment`, `Version`,
  `Invitation`'s `invitedByUserId`) use `onDelete: Restrict` on their
  `User` relation — FR-048 requires attribution to survive a user's
  removal, and this codebase has no user-deletion capability at all
  today (003-database-foundation Research Decision 6 — account
  lifecycle is out of scope). `Restrict` is the conservative default:
  if user deletion is ever implemented later, it will fail loudly against
  a user with historical attribution rather than silently orphaning or
  deleting that history — satisfying FR-048 without requiring a
  premature soft-delete redesign of `User` today.

---

## Entity: ProjectMember

**Repository**: `src/server/repositories/membershipRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `projectId` | identifier (string) | Foreign key → `Project.id`, cascade delete |
| `userId` | identifier (string) | Foreign key → `User.id`, cascade delete (Edge Cases: deleted users) |
| `role` | string | `"Owner"` \| `"Editor"` \| `"Viewer"` (FR-004) |
| `createdAt` | timestamp | Auto-set |
| `updatedAt` | timestamp | Auto-refreshed on role change |

**Relationships**: Many `ProjectMember` belong to one `Project`; many
belong to one `User`. `@@unique([projectId, userId])` — one membership
row per user per project.

**Validation rules**: A `Project` MUST always have exactly one member with
`role = "Owner"`, kept in sync with `Project.ownerId` (unchanged,
003-database-foundation) — creating a project inserts its owner's
`ProjectMember` row automatically; transferring ownership (FR-003) updates
both `Project.ownerId` and the two affected `ProjectMember.role` values
inside one transaction.

**Indexes**: `@@index([projectId])`, `@@index([userId])`.

---

## Entity: Invitation

**Repository**: `src/server/repositories/invitationRepository.ts`

Required by FR-010–FR-012; not one of the seven explicitly named models
but has no home in any of them.

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `projectId` | identifier (string) | Foreign key → `Project.id`, cascade delete |
| `invitedByUserId` | identifier (string) | Foreign key → `User.id`, `Restrict` (attribution) |
| `invitedUserId` | identifier (string) | Foreign key → `User.id`, cascade delete |
| `role` | string | `"Editor"` \| `"Viewer"` (never `"Owner"` — ownership only changes via transfer, FR-003) |
| `status` | string | `"pending"` \| `"accepted"` \| `"declined"` \| `"expired"` |
| `createdAt` | timestamp | Auto-set |
| `updatedAt` | timestamp | Auto-refreshed on status change |

**Validation rules**: Creating an invitation MUST be rejected (as a no-op
returning the existing row, not an error) if a `"pending"` invitation
already exists for the same `(projectId, invitedUserId)`, or if that user
already has a `ProjectMember` row (Edge Cases: duplicate invitations) —
enforced at the repository level (a conditional check, not a blanket
`@@unique`, since a *new* invitation after a prior one was declined or
expired must remain possible).

**Indexes**: `@@index([projectId])`, `@@index([invitedUserId, status])`.

---

## Entity: Comment

**Repository**: `src/server/repositories/commentRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `featureId` | identifier (string) | Foreign key → `Feature.id`, cascade delete (matches `FeatureAttribute`/`FeatureStyle`'s existing precedent) |
| `authorId` | identifier (string) | Foreign key → `User.id`, `Restrict` (attribution) |
| `parentCommentId` | identifier (string)? | Self-relation → `Comment.id`, cascade delete (deleting a top-level comment removes its replies) |
| `body` | string | Non-empty; `@username` tokens parsed for mentions at save time (Research Decision 11) |
| `resolved` | boolean | Default `false` (FR-033) |
| `mentionedUserIds` | JSON (string array) | Populated from `body` parsing at save time |
| `createdAt` | timestamp | Auto-set |
| `updatedAt` | timestamp | Auto-refreshed on edit |

**Relationships**: Many `Comment` belong to one `Feature`; many belong to
one `User` (author); a `Comment` may belong to one parent `Comment`
(reply) and have many child `Comment` (replies).

**Validation rules**: Only `authorId` may edit or delete a `Comment`
(FR-035) — enforced at the repository level, not by a DB constraint.
Resolving MUST only toggle `resolved`; it MUST NOT delete or hide the row
or its replies (FR-033).

**Indexes**: `@@index([featureId])`, `@@index([authorId])`,
`@@index([parentCommentId])`.

---

## Entity: Activity

**Repository**: `src/server/repositories/activityRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `projectId` | identifier (string) | Foreign key → `Project.id`, cascade delete |
| `userId` | identifier (string) | Foreign key → `User.id`, `Restrict` (attribution, FR-048) |
| `action` | string | `"create"` \| `"edit"` \| `"delete"` \| `"import"` \| `"export"` \| `"share"` \| `"permission_change"` \| `"version_restore"` (FR-023) |
| `targetType` | string | `"layer"` \| `"feature"` \| `"member"` \| `"version"` \| `"comment"` \| `"invitation"` |
| `targetId` | identifier (string)? | The specific target's id; nullable for an action with no single target (e.g., a bulk export) |
| `metadata` | JSON? | Optional extra detail (e.g., the permission change's before/after role) |
| `createdAt` | timestamp | Auto-set; the sole ordering field — **no `updatedAt`, this table has no update path at all** |

**Relationships**: Many `Activity` belong to one `Project`; many belong to
one `User`.

**Validation rules**: `Activity` rows are append-only — no Route Handler
or repository function updates or deletes one, ever (FR-047). Every
repository function that performs a recordable action writes its
`Activity` row inside the same transaction as the action (Research
Decision 8) — never a separate, best-effort call.

**Indexes**: `@@index([projectId, createdAt])` (History listing, newest
first — mirrors `AnalysisRun`'s identical index shape from
005-spatial-analysis-geoprocessing), `@@index([userId])`.

---

## Entity: Version

**Repository**: `src/server/repositories/versionRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `projectId` | identifier (string) | Foreign key → `Project.id`, cascade delete |
| `createdByUserId` | identifier (string) | Foreign key → `User.id`, `Restrict` (attribution) |
| `note` | string? | Optional, member-supplied (FR-026) |
| `snapshot` | JSON | Full serialized layer/feature/attribute/style state at save time (Research Decision 7) |
| `isPreRestoreSnapshot` | boolean | `true` only for the automatic snapshot FR-029 creates immediately before a restore — lets the UI distinguish manual saves from restore safety-snapshots |
| `createdAt` | timestamp | Auto-set; the sole ordering field — **no `updatedAt`, versions are immutable once created** |

**Relationships**: Many `Version` belong to one `Project`; many belong to
one `User` (creator).

**Validation rules**: Restoring a version (FR-028) MUST, inside one
transaction: (1) create a new `Version` with `isPreRestoreSnapshot: true`
capturing current state, (2) replace current layers/features with the
target version's `snapshot` content, (3) write an `Activity` row
(`action: "version_restore"`). No `Version` row is ever deleted by any
code path (FR-029, SC-007).

**Indexes**: `@@index([projectId, createdAt])`.

---

## Entity: Notification

**Repository**: `src/server/repositories/notificationRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `recipientUserId` | identifier (string) | Foreign key → `User.id`, cascade delete |
| `type` | string | `"project_shared"` \| `"invitation_accepted"` \| `"comment_added"` \| `"mention"` \| `"version_restored"` \| `"feature_assigned"` \| `"lock_conflict"` (FR-036) |
| `payload` | JSON | Type-specific context (e.g., `projectId`, `featureId`, `commentId`) |
| `read` | boolean | Default `false` (FR-037) |
| `createdAt` | timestamp | Auto-set |

**Relationships**: Many `Notification` belong to one `User` (recipient).

**Validation rules**: Only the recipient may mark their own notification
read (repository-level check, not a DB constraint).

**Indexes**: `@@index([recipientUserId, read])` (unread-count query,
FR-038), `@@index([recipientUserId, createdAt])` (listing, newest first).

---

## Entity: FeatureLock

**Repository**: `src/server/repositories/featureLockRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `featureId` | identifier (string) | Foreign key → `Feature.id`, cascade delete; `@unique` — at most one active lock per feature |
| `lockedByUserId` | identifier (string) | Foreign key → `User.id`, cascade delete |
| `acquiredAt` | timestamp | Auto-set on acquire |
| `expiresAt` | timestamp | Rolling — refreshed on every edit "heartbeat" while the holder is active; a lock past this timestamp is treated as released (Research Decision 3's read-time-expiry pattern, reused here) |

**Relationships**: One `FeatureLock` belongs to zero-or-one `Feature`
(enforced by the `@unique` on `featureId`); many belong to one `User`.

**Validation rules**: `featureRepository.updateFeature`/`deleteFeature`
(003-database-foundation) each gain one guard clause checking for a
different, unexpired `FeatureLock` before their existing logic runs
(Research Decision 4) — rejected as a new `ConflictError` → `409`.
Saving or canceling an edit deletes the lock row immediately (FR-020).

**Indexes**: `@@unique([featureId])` (also serves as the lookup index).

---

## Entity: Presence

**Repository**: `src/server/repositories/presenceRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `projectId` | identifier (string) | Foreign key → `Project.id`, cascade delete |
| `userId` | identifier (string) | Foreign key → `User.id`, cascade delete |
| `cursorLng` / `cursorLat` | float? | Nullable — a member may not have moved their cursor yet this session |
| `viewportBounds` | JSON? | `[west, south, east, north]` — the member's current map extent |
| `currentFeatureId` | string? | The feature the member is currently editing, if any — a plain denormalized reference (no live FK), since presence is inherently ephemeral and this value is always cross-checked against `FeatureLock` for authoritative lock state, not relied on alone |
| `lastSeenAt` | timestamp | Updated on every heartbeat/cursor/extent change; a row older than 30 s (spec Assumptions) is treated as offline at read time (Research Decision 3) |

**Relationships**: Many `Presence` belong to one `Project`; many belong to
one `User`. `@@unique([projectId, userId])` — one upserted row per member
per project.

**Indexes**: `@@index([projectId, lastSeenAt])` (building the active-
member list, filtering out stale rows).

---

## Modified Existing Models (additive only)

- **`Project`**: `+ members ProjectMember[]`, `+ invitations Invitation[]`,
  `+ activities Activity[]`, `+ versions Version[]`. `ownerId` and every
  existing field/index/cascade rule unchanged.
- **`Feature`**: `+ comments Comment[]`, `+ lock FeatureLock?`. Every
  existing field/index/cascade rule unchanged; `updateFeature`/
  `deleteFeature`'s *logic* gains a lock guard clause (Research Decision
  4), but their signatures and callers do not change.
- **`User`**: `+ memberships ProjectMember[]`, `+ sentInvitations
  Invitation[]`, `+ receivedInvitations Invitation[]`, `+ comments
  Comment[]`, `+ activities Activity[]`, `+ versions Version[]`, `+
  notifications Notification[]`, `+ featureLocks FeatureLock[]`, `+
  presenceSessions Presence[]`.
