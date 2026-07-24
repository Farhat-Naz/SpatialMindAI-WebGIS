# Data Model: Administration & Security (009)

**Prerequisite**: `research.md` (Decisions 1, 5, 9, 10, 13, 15 drive this
file directly).

This feature modifies the existing `User` model (additive fields only)
and adds **eleven** new Prisma models: `Session`, `SystemRole`,
`PermissionGroup`, `SystemRolePermissionGroup` (join), `SecurityAuditLog`,
`SecuritySettings`, `ApiKey`, `ApiKeyUsageLog`, `SystemSettings`,
`Backup`. No existing model's fields are removed or retyped; 006's
`Activity` model is untouched (research.md Decision 10).

---

## Entity: `User` (MODIFIED)

| Field | Type | Notes |
|---|---|---|
| `id`, `email`, `name`, `projects`, `createdAt`, `updatedAt` | *(unchanged)* | existing fields, untouched |
| `systemRoleId` | `String` (FK → `SystemRole`, `Restrict`) | **NEW**, required — every user has exactly one platform-wide role (research.md Decision 5) |
| `isActive` | `Boolean` | **NEW**, default `true` — deactivation (FR-007/FR-008) sets this `false` rather than deleting the row |
| `deletedAt` | `DateTime?` | **NEW** — soft-delete marker (FR-007); a "deleted" user is `isActive: false` AND `deletedAt` set, distinguishing "deactivated, may be reactivated" from "deleted" while preserving attribution on every row that references `userId` elsewhere in the schema (Project.ownerId, AnalysisRun.userId, Activity.userId, etc. — none of which are touched by this feature) |
| `credential` | back-relation | **NEW** — one-to-one to `UserCredential` |
| `sessions` | back-relation | **NEW** — one-to-many to `Session` |
| `apiKeys` | back-relation | **NEW** — one-to-many to `ApiKey` |

**Relationships**: `SystemRole 1──* User` (every user has one role);
`User 1──1 UserCredential`; `User 1──* Session`; `User 1──* ApiKey`.

**Indexes**: `@@index([systemRoleId])` (new); `@@index([isActive])` (new
— "list active users" is the default admin view, FR-007).

**Validation rules**: A `User` cannot be deleted (FR-007) while they are
the platform's last remaining `Admin`-role user (spec Edge Cases,
FR-010) — enforced in the repository, not the schema (a schema
constraint cannot express "count of role X ≥ 1").

---

## Entity: `UserCredential` (NEW)

One-to-one extension of `User`, kept separate so the base `User` row
(already referenced by every other feature's foreign keys) never needs a
schema migration again as auth evolves.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String @unique` (FK → `User`, `onDelete: Cascade`) | |
| `passwordHash` | `String` | `salt:hash` format, `node:crypto` `scrypt` (research.md Decision 3) |
| `passwordUpdatedAt` | `DateTime` | drives a future "password age" policy if ever needed; also invalidated-on-change marker |
| `passwordResetTokenHash` | `String?` | hash only, never the raw token (research.md Decision 4) |
| `passwordResetExpiresAt` | `DateTime?` | |
| `mfaEnabled` | `Boolean` | default `false` — data-model readiness only (research.md/spec.md — "MFA ready," not a working second factor) |
| `mfaSecretEncrypted` | `String?` | reserved column, unused until a future MFA-verification feature ships; encrypted at rest identically to `SystemSettings.smtpPasswordEncrypted` if ever populated (research.md Decision 14) |
| `createdAt` / `updatedAt` | `DateTime` | |

**Relationships**: `User 1──1 UserCredential`.

**Indexes**: `@@unique([userId])`; `@@index([passwordResetTokenHash])`
(reset-link lookup).

**Validation rules**: `passwordHash` is never selected in any query
response shape returned to a client (repository-layer projection
discipline, matching how `Report.fileContent`/`ApiKey` secrets are
already excluded from list responses in 008's precedent).

---

## Entity: `Session`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String` (FK → `User`, `onDelete: Cascade`) | |
| `tokenHash` | `String @unique` | hash of the opaque session token in the cookie (research.md Decision 1) |
| `isPersistent` | `Boolean` | `true` for "remember me" (FR-003) |
| `expiresAt` | `DateTime` | computed at issue time from `SecuritySettings.sessionTimeoutMinutes` (non-persistent) or a longer bounded max (persistent) |
| `lastActivityAt` | `DateTime` | updated per request (bounded — see plan.md Performance for update-frequency throttling) so inactivity-based expiry (FR-004) is measurable |
| `ipAddress` | `String?` | recorded for the session's originating request, feeds Monitoring/audit context |
| `userAgent` | `String?` | |
| `createdAt` | `DateTime` | |

**Relationships**: `User 1──* Session`.

**Indexes**: `@@unique([tokenHash])`; `@@index([userId])`;
`@@index([expiresAt])` (cleanup/expiry sweep queries).

**Validation rules**: Deleting a `Session` row (sign-out, FR-004) or a
user's `isActive` flipping to `false` (deactivation) both MUST make the
session invalid on the *next* validated request — the repository's
session-validation read checks `isActive` on the joined `User` every
time, not only at session-issue time (spec Edge Cases).

---

## Entity: `SystemRole`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `key` | `String @unique` | `"admin" \| "manager" \| "editor" \| "viewer"` for the four built-ins; a slug for custom roles |
| `name` | `String` | display name |
| `isBuiltIn` | `Boolean` | `true` for the four seeded roles — cannot be deleted or have its permission groups changed (FR-011 implies these four are fixed) |
| `createdAt` / `updatedAt` | `DateTime` | |

**Relationships**: `SystemRole 1──* User`; `SystemRole *──*
PermissionGroup` (via `SystemRolePermissionGroup`).

**Indexes**: unique `key` is the sole lookup index needed at this scale.

**Validation rules**: `isBuiltIn: true` rows reject any
delete/permission-group-change request at the repository layer
(`ValidationError`), even from an Admin — only their assignment to users
can change, never their definition, keeping the four built-ins a stable
contract (FR-011).

---

## Entity: `PermissionGroup`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `key` | `String @unique` | e.g. `"manage_users"`, `"manage_roles"`, `"view_audit_logs"`, `"manage_security_settings"`, `"manage_api_keys"`, `"manage_system_settings"`, `"manage_backups"`, `"view_monitoring"`, `"manage_permissions"` |
| `name` | `String` | display name |
| `description` | `String?` | |

**Relationships**: `PermissionGroup *──* SystemRole` (via
`SystemRolePermissionGroup`).

**Indexes**: unique `key`.

**Validation rules**: Seeded, fixed catalog (`prisma/seed.ts`) — this
phase does not support administrator-defined *new* permission groups,
only administrator-composed *combinations* of the existing catalog into
custom roles (FR-012 speaks to composing roles from groups, not
inventing new groups).

---

## Entity: `SystemRolePermissionGroup` (join table)

| Field | Type | Notes |
|---|---|---|
| `systemRoleId` | `String` (FK → `SystemRole`, `onDelete: Cascade`) | |
| `permissionGroupId` | `String` (FK → `PermissionGroup`, `onDelete: Cascade`) | |

**Indexes**: `@@id([systemRoleId, permissionGroupId])` (composite
primary key, no surrogate id needed for a pure join table).

---

## Entity: `SecurityAuditLog`

Platform-wide events with no project context (research.md Decision 10) —
`Activity` (006) remains the record for project-scoped actions;
this table is additive, not a replacement.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String?` (FK → `User`, `onDelete: SetNull`) | nullable — a failed sign-in attempt with an unregistered email has no resolvable user |
| `attemptedEmail` | `String?` | recorded for failed sign-in attempts where `userId` is null (FR-017) |
| `eventType` | `String` | `"login_success" \| "login_failure" \| "logout" \| "password_reset_requested" \| "password_reset_completed" \| "user_created" \| "user_deactivated" \| "user_reactivated" \| "user_deleted" \| "role_assigned" \| "role_created" \| "role_deleted" \| "permission_changed" \| "security_setting_changed" \| "system_setting_changed" \| "api_key_created" \| "api_key_rotated" \| "api_key_revoked" \| "backup_created" \| "backup_restored" \| "ip_blocked"` |
| `category` | `String` | `"activity" \| "security_event"` — the FR-017's "distinguishable security event" split (spec Acceptance Scenario US5.4) |
| `actorUserId` | `String?` (FK → `User`, `onDelete: SetNull`) | who performed an administrative action on another user/setting (may equal `userId` for self-service actions, e.g. a user resetting their own password) |
| `targetType` | `String?` | `"user" \| "role" \| "permission_group" \| "security_settings" \| "system_settings" \| "api_key" \| "backup"` |
| `targetId` | `String?` | |
| `metadata` | `Json?` | before/after values for a change event, mirroring `Activity.metadata`'s existing shape |
| `ipAddress` | `String?` | |
| `createdAt` | `DateTime` | sole ordering field — append-only, matching `Activity`'s existing "no update path" convention |

**Relationships**: `User 0..1──* SecurityAuditLog` (subject, set-null on
user deletion so the log entry survives); `User 0..1──*
SecurityAuditLog` (actor, second relation, also set-null).

**Indexes**: `@@index([createdAt])` (platform-wide chronological view,
merged with `Activity` at the query layer per research.md Decision 10);
`@@index([userId])`; `@@index([category, createdAt])` (security-event
filtering, FR-019).

**Validation rules**: Append-only — no Route Handler or repository
function updates or deletes a row, identical convention to `Activity`
(FR-017). Every repository function that performs a recordable action
writes its `SecurityAuditLog` row inside the same transaction as the
action, mirroring `Activity`'s existing "never a separate, best-effort
call" rule (006 Research Decision 8, reused here).

---

## Entity: `SecuritySettings`

Singleton (research.md Decision 13's pattern, applied here too since
password policy/session timeout/rate limits/IP list are also a closed,
fixed set).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default("singleton")` | fixed id enforces a single row |
| `passwordMinLength` | `Int` | default `12` |
| `passwordRequireUppercase` | `Boolean` | default `true` |
| `passwordRequireNumber` | `Boolean` | default `true` |
| `passwordRequireSymbol` | `Boolean` | default `false` |
| `sessionTimeoutMinutes` | `Int` | default `60` — inactivity timeout (FR-004/FR-021) |
| `rememberMeMaxDays` | `Int` | default `30` — persistent-session bound (FR-003) |
| `signInRateLimitPerMinute` | `Int` | default `10` — feeds the `"auth:signin"` bucket (research.md Decision 11) |
| `passwordResetRateLimitPerHour` | `Int` | default `5` |
| `ipAllowList` | `String[]` | empty = no allow-list restriction |
| `ipDenyList` | `String[]` | empty = no deny-list restriction |
| `updatedAt` | `DateTime` | |
| `updatedByUserId` | `String?` (FK → `User`, `onDelete: SetNull`) | who last changed settings, for the audit trail's context |

**Relationships**: `User 0..1──* SecuritySettings` (last-updater,
optional).

**Indexes**: none beyond the primary key — single row.

**Validation rules**: Every field change writes a `SecurityAuditLog` row
(`eventType: "security_setting_changed"`, `category: "security_event"`)
in the same transaction (FR-024).

---

## Entity: `ApiKey`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String` (FK → `User`, `onDelete: Cascade`) | owner |
| `name` | `String` | user-chosen label |
| `secretHash` | `String @unique` | hash only (research.md Decision 9); raw secret shown once at creation, never stored |
| `scope` | `String[]` | subset of `PermissionGroup.key` values, validated ⊆ the owner's role's groups at creation and re-validated live at use (research.md Decision 9) |
| `projectId` | `String?` (FK → `Project`, `onDelete: Cascade`) | optional project-scoping (a key limited to one project) |
| `expiresAt` | `DateTime?` | null = no expiration |
| `revokedAt` | `DateTime?` | set on manual revocation (FR-027) |
| `rotatedFromKeyId` | `String?` (FK → `ApiKey.id`, self-relation, `onDelete: SetNull`) | preserves identity/history across a rotation |
| `lastUsedAt` | `DateTime?` | |
| `createdAt` | `DateTime` | |

**Relationships**: `User 1──* ApiKey`; `Project 0..1──* ApiKey`;
self-relation for rotation chains; `ApiKey 1──* ApiKeyUsageLog`.

**Indexes**: `@@unique([secretHash])`; `@@index([userId])`;
`@@index([expiresAt])`.

**Validation rules**: A request presenting an expired or revoked key is
rejected (`401`) before any handler logic runs (FR-027); scope is
re-intersected against the owner's *current* role's permission groups on
every use, never trusting the `scope` column alone if the owner has
since been downgraded (research.md Decision 9, spec Edge Cases).

---

## Entity: `ApiKeyUsageLog`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `apiKeyId` | `String` (FK → `ApiKey`, `onDelete: Cascade`) | |
| `endpoint` | `String` | |
| `statusCode` | `Int` | |
| `createdAt` | `DateTime` | |

**Relationships**: `ApiKey 1──* ApiKeyUsageLog`.

**Indexes**: `@@index([apiKeyId, createdAt])` (per-key usage list,
FR-028); `@@index([createdAt])` (platform-wide API statistics, US10 AC2).

**Validation rules**: Append-only; written on every API-key-authenticated
request, best-effort (a logging failure must never block the actual
request it's logging — the one place in this feature where the
"same transaction" rule from `SecurityAuditLog`/`Activity` is
deliberately relaxed, since usage logging is telemetry, not an
audit-of-record for a security-relevant state change).

---

## Entity: `SystemSettings`

Singleton (research.md Decision 13).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default("singleton")` | |
| `platformName` | `String` | default `"SpatialMindAI"` |
| `supportContactEmail` | `String?` | |
| `storageLimitBytesPerProject` | `BigInt?` | null = no limit |
| `mapDefaultCenterLat` | `Float` | |
| `mapDefaultCenterLng` | `Float` | |
| `mapDefaultZoom` | `Int` | |
| `mapDefaultBasemap` | `String?` | |
| `smtpHost` | `String?` | |
| `smtpPort` | `Int?` | |
| `smtpUsername` | `String?` | |
| `smtpPasswordEncrypted` | `String?` | AES-256-GCM via `node:crypto`, never plaintext (research.md Decision 14) |
| `smtpFromAddress` | `String?` | |
| `backupScheduleEnabled` | `Boolean` | default `false` |
| `backupScheduleCron` | `String?` | e.g. `"0 3 * * *"` — interpreted by the same external-scheduler pattern as `ScheduledReport` (research.md Decision 16) |
| `backupRetentionCount` | `Int` | default `10` — oldest `Backup` rows beyond this count are pruned, mirroring 008's `Report` retention cap |
| `updatedAt` | `DateTime` | |
| `updatedByUserId` | `String?` (FK → `User`, `onDelete: SetNull`) | |

**Relationships**: `User 0..1──* SystemSettings` (last-updater).

**Indexes**: none beyond the primary key — single row.

**Validation rules**: `smtpPasswordEncrypted` is never included in any
`GET` response — write-only from the API's perspective (a settings read
returns whether SMTP is configured, not the credential); every field
change writes a `SecurityAuditLog` row (`eventType:
"system_setting_changed"`).

---

## Entity: `Backup`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `projectId` | `String` (FK → `Project`, `onDelete: Cascade`) | |
| `triggeredByUserId` | `String?` (FK → `User`, `onDelete: SetNull`) | null for a scheduled backup |
| `trigger` | `String` | `"manual" \| "scheduled"` |
| `status` | `String` | `"succeeded" \| "failed"` — always written already-terminal, same shape as 008's `Report.status` (research.md Decision 15) |
| `fileContent` | `Bytes?` | the backup archive; null when `status: "failed"` |
| `sizeBytes` | `Int?` | |
| `errorMessage` | `String?` | |
| `createdAt` | `DateTime` | |

**Relationships**: `Project 1──* Backup`; `User 0..1──* Backup`
(triggering user, optional).

**Indexes**: `@@index([projectId, createdAt])` (backup history, newest
first, US9 AC2/3).

**Validation rules**: Retention cap (`SystemSettings.backupRetentionCount`)
prunes the oldest `Backup` rows for a project beyond the configured count,
identical mechanism to 008's `Report` retention (data-model.md there).
A `restoreProject` operation (repository-api.md) reads a `Backup`'s
`fileContent` and replaces the target project's layers/features/
dashboards inside one transaction — on any failure mid-restore, the
transaction rolls back entirely, leaving the target project's original
state intact (FR-037, spec Edge Cases).

---

## Back-relations added to existing models

```prisma
model User {
  // ...existing fields unchanged...
  systemRoleId String
  systemRole   SystemRole        @relation(fields: [systemRoleId], references: [id])
  isActive     Boolean           @default(true)
  deletedAt    DateTime?
  credential   UserCredential?
  sessions     Session[]
  apiKeys      ApiKey[]
  backups      Backup[]
}

model Project {
  // ...existing fields unchanged...
  apiKeys ApiKey[]
  backups Backup[]
}
```

No existing field on `User` or `Project` is renamed, retyped, or
removed — every addition is a new column or back-relation array.

---

## Migration notes

- One migration: add `User.systemRoleId`/`isActive`/`deletedAt`
  (`systemRoleId` added nullable → backfilled with a seeded default
  "Editor" `SystemRole` for every pre-existing user (an operator
  reassigns real roles post-migration, and the platform's bootstrap
  Admin, research.md Decision 18, is created/promoted separately) →
  tightened to `NOT NULL`, the same add-nullable→backfill→tighten shape
  007/008 already used for a required FK on a non-empty table) plus
  create all eleven new tables.
- Seed data (`prisma/seed.ts`): four built-in `SystemRole` rows, the full
  `PermissionGroup` catalog, their `SystemRolePermissionGroup`
  assignments (Admin gets every group; Manager gets
  `manage_users`/`view_audit_logs`/`manage_permissions` per spec.md's
  documented default split; Editor/Viewer get none), one singleton
  `SecuritySettings` row with the documented defaults, one singleton
  `SystemSettings` row with the documented defaults, and (research.md
  Decision 18) the bootstrap Admin `User` + `UserCredential`.
- No new PostGIS/geometry column is introduced by this feature — every
  new table is ordinary relational data.
