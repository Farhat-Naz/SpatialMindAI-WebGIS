---

description: "Task list for feature implementation"
---

# Tasks: Administration & Security

**Input**: Design documents from `specs/009-administration-security/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/, quickstart.md (all present and approved)

**Tests**: Explicitly requested (unit, API, hook, store, integration,
performance, accessibility, security tiers) — included throughout.

**Organization**: This roadmap uses the 20-phase, layer-first structure
explicitly requested for this feature, the same shape 007/008's
tasks.md already used. Phases 8–16 map to spec.md's user stories, but —
because the requested phase *names* group by theme rather than 1:1 by
story — several phases mix story labels, exactly as 007's Phase 16 and
008's Phases 8/9/10/16 already did. Every task's label reflects the
story it factually belongs to, not just its phase's theme name.

**Architecture note (read before starting)**: Per the **approved**
research.md/data-model.md, several concepts named in the requested phase
outline map onto different real artifacts than their literal names might
suggest:

- **"User Profile"** (Phase 2) → the existing `User` model (name/email,
  unchanged) plus the new `UserCredential` model (password/reset-token
  data) — not a third "UserProfile" table.
- **"UserRole"** (Phase 2) → `User.systemRoleId`, a single required
  foreign key (data-model.md) — **not** a many-to-many join table. Each
  user has exactly one system role at a time (research.md Decision 5);
  `SystemRolePermissionGroup` is the actual many-to-many join table in
  this feature (roles ↔ permission groups, not users ↔ roles).
- **"ProjectPermission"/"LayerPermission"** (Phase 2) → **not** new
  tables. Per data-model.md and research.md's core theme (reuse, don't
  duplicate), project-level permission data already lives in
  006-collaboration's `ProjectMember` table; there is no per-layer ACL
  anywhere in this codebase to extend, so "layer permissions" (spec.md
  US4 AC2's explicitly conditional "if configured") is served by the same
  project-level view until/unless a future feature introduces real
  per-layer ACLs.
- **"SecurityEvent"/"LoginHistory"** (Phase 2) → **not** separate tables.
  Both are `SecurityAuditLog` rows (`eventType`/`category` columns,
  data-model.md) — one unified table, not three.
- **"BackupHistory"** (Phase 2) → the `Backup` table's own rows *are*
  the history; there is no separate history table.
- **"UserRepository"** (Phase 3) → split into `authRepository.ts`
  (credentials/sessions — secret-handling code) and
  `userManagementRepository.ts` (admin-facing profile/status CRUD) per
  repository-api.md, mirroring `Feature`/`FeatureStyle`'s existing
  one-to-one split precedent for the same reason (keep secret-handling
  code in one narrow, auditable file).
- **"SecurityRepository"/"SettingsRepository"** (Phase 3) →
  `securitySettingsRepository.ts` (policy: password/session/rate-limit/IP)
  and `systemSettingsRepository.ts` (operational: general/storage/map/
  email/backup) respectively — two singleton-owning repositories, not
  one, matching data-model.md's deliberate `SecuritySettings`/
  `SystemSettings` split (Decision 13 in research.md).

Every task below implements the real, approved artifact and says
explicitly which one a named concept maps to.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency)
- **[Story]**: US1–US10 per spec.md's plan.md-established numbering
  (US1 Authentication, US2 User Management, US3 Role Management, US4
  Permission Management, US5 Audit Logs, US6 Security Settings, US7 API
  Key Management, US8 System Settings, US9 Backup & Restore, US10
  Monitoring), applied only to Phases 8–16; Phases 1–7/17–20 carry no
  story label
- Every task lists exact file paths and the fields required by this
  roadmap: Priority, User Story, Files, Goal, Acceptance Criteria
  (traceable to a spec.md FR-/SC- id), Verification, Dependencies

---

## Phase 1: Foundation

**Purpose**: Configuration, security/permission constants, shared/RBAC
types, validation schema shells, the shared `ApiErrorCode` vocabulary,
crypto/audit/rate-limit utilities, query keys, and environment
validation every later phase depends on.

- [ ] T001 Add authentication/security configuration constants
  - **Priority**: Must-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/server/security/securityConfig.constants.ts` (new)
  - **Goal**: Default session-timeout/remember-me/rate-limit/password-policy values (data-model.md's `SecuritySettings` defaults) as named, typed constants — the values seeded into the `SecuritySettings` singleton row and the fallback used before that row exists.
  - **Acceptance Criteria**: Every later task needing a default security value imports from this file, not a magic number.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [ ] T002 [P] Add permission-group key constants
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/auth/permissionGroups.constants.ts` (new)
  - **Goal**: One typed union/array of every `PermissionGroup.key` value (`manage_users`, `manage_roles`, `view_audit_logs`, `manage_security_settings`, `manage_api_keys`, `manage_system_settings`, `manage_backups`, `view_monitoring`, `manage_permissions` — data-model.md) — the single source both the seed script and `assertSystemPermission` (Phase 2) reference, so the catalog is never spelled out twice.
  - **Acceptance Criteria**: Adding a tenth permission group later requires touching only this file plus the seed script.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [ ] T003 [P] Create shared auth/admin types
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/types/auth.types.ts` (new), `src/features/admin/types/admin.types.ts` (new)
  - **Goal**: Re-exported TypeScript types for `User` (extended fields), `UserCredential`-derived shapes (never the hash itself), `Session`, `SystemRole`, `PermissionGroup`, `SecurityAuditLog`, `SecuritySettings`, `ApiKey`, `ApiKeyUsageLog`, `SystemSettings`, `Backup` per data-model.md — mirrors every prior feature's re-export-only pattern.
  - **Acceptance Criteria**: Every field in data-model.md's entities has a corresponding TypeScript type; zero `any`; no type here ever includes `passwordHash`/`secretHash`/`smtpPasswordEncrypted`.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [ ] T004 [P] Define RBAC types
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/auth/rbac.types.ts` (new)
  - **Goal**: `SystemRoleKey` (`"admin" | "manager" | "editor" | "viewer" | string` for custom), `PermissionGroupKey` (from T002), and an `EffectivePermissions` type describing what `assertSystemPermission` resolves a user's access to.
  - **Acceptance Criteria**: `assertSystemPermission` (Phase 2) is fully typed against this file, no stringly-typed permission checks anywhere.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T002

- [ ] T005 Create Zod validation schema shells
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/auth.schema.ts` (new), `src/shared/contracts/userManagement.schema.ts` (new), `src/shared/contracts/role.schema.ts` (new), `src/shared/contracts/securitySettings.schema.ts` (new), `src/shared/contracts/apiKey.schema.ts` (new), `src/shared/contracts/systemSettings.schema.ts` (new), `src/shared/contracts/backup.schema.ts` (new)
  - **Goal**: Shells only — envelope fields and file structure per api-contracts.md; full field validation lands with each phase that needs it (Constitution Principle II).
  - **Acceptance Criteria**: Each file exports at least one Zod schema + one `z.infer` type.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003, T004

- [ ] T006 [P] Add `ForbiddenError`/`FORBIDDEN` to the shared error vocabulary
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/errors/apiError.ts` (modify)
  - **Goal**: Add `403 FORBIDDEN`/`ForbiddenError` (research.md Decision 7) — **skip with a no-op verification note if 006/007/008 has already landed this addition**; exactly one definition must exist regardless of which feature adds it first.
  - **Acceptance Criteria**: `npx tsc --noEmit` and no duplicate `ForbiddenError` class in the codebase.
  - **Verification**: `npx tsc --noEmit`; `npx eslint src/shared/errors/apiError.ts --max-warnings 0`
  - **Dependencies**: None

- [ ] T007 Create `passwordHash.ts` — `node:crypto` `scrypt` wrapper
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/security/passwordHash.ts` (new)
  - **Goal**: `hashPassword(plain): string` / `verifyPasswordHash(plain, stored): boolean` using `node:crypto`'s `scrypt` with a random per-password salt, `salt:hash` storage format (research.md Decision 3) — zero new npm dependency.
  - **Acceptance Criteria**: Two calls with the same password produce different stored hashes (random salt); verification succeeds only for the correct plaintext.
  - **Verification**: `npx tsc --noEmit`; unit test in T016
  - **Dependencies**: None

- [ ] T008 [P] Create `secretToken.ts` — random-token + hash-at-rest helper
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/security/secretToken.ts` (new)
  - **Goal**: `generateSecretToken(): { rawToken: string; tokenHash: string }` / `hashToken(rawToken): string` via `node:crypto` `randomBytes` + a fast cryptographic hash (SHA-256) for the at-rest comparison value — the one shared pattern reused by sessions, password-reset tokens, and API key secrets alike (research.md Decisions 1, 4, 9).
  - **Acceptance Criteria**: `rawToken` is high-entropy (≥256 bits); `tokenHash` is deterministic (same input → same hash, for lookup) but the raw token is never derivable from the hash.
  - **Verification**: `npx tsc --noEmit`; unit test in T016
  - **Dependencies**: None

- [ ] T009 [P] Create `encryption.ts` — AES-256-GCM wrapper
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/security/encryption.ts` (new)
  - **Goal**: `encryptSecret(plain): string` / `decryptSecret(ciphertext): string` via `node:crypto`, keyed by the new server-only `ADMIN_SECRETS_ENCRYPTION_KEY` environment variable (research.md Decision 14) — used for `SystemSettings.smtpPasswordEncrypted`.
  - **Acceptance Criteria**: Encrypting the same plaintext twice produces different ciphertext (random IV per call); decrypting a tampered ciphertext throws rather than returning corrupted plaintext (GCM's authentication property).
  - **Verification**: `npx tsc --noEmit`; unit test in T016
  - **Dependencies**: None

- [ ] T010 Create audit-logging utility shell
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/security/auditContext.ts` (new)
  - **Goal**: A small helper building the common `{ ipAddress, userAgent }` context object from a `Request`, reused by every `recordSecurityEvent` call site (Phase 3) so IP/user-agent extraction logic exists in exactly one place, not copy-pasted across nine repository files.
  - **Acceptance Criteria**: Handles the platform-appropriate header (`x-forwarded-for` etc.) per plan.md's Deployment Notes, documented inline for which header each deployment target uses.
  - **Verification**: `npx tsc --noEmit`; unit test in T016
  - **Dependencies**: None

- [ ] T011 [P] Add rate-limit bucket constants
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/http/assertWriteRateLimit.ts` (modify — add new bucket name constants only, no change to the existing rate-limiting mechanism itself)
  - **Goal**: Add `"auth:signin"`, `"auth:password-reset"`, `"admin:write"` as named bucket constants, reusing the existing `checkRateLimit`/`assertWriteRateLimit` function unchanged (research.md Decision 11) — this task adds no new rate-limiting logic, only new bucket identifiers.
  - **Acceptance Criteria**: No change to `checkRateLimit`'s implementation; only new named buckets are added.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [ ] T012 [P] Add `assertIpAllowed` shell
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/security/assertIpAllowed.ts` (new — shell; full `SecuritySettings`-backed logic lands in Phase 3 once `securitySettingsRepository.ts` exists)
  - **Goal**: Declare the function signature (`assertIpAllowed(request: Request): Promise<void>`, throwing `ForbiddenError`) and the break-glass bypass check (`IP_RESTRICTION_BYPASS_TOKEN` env var, research.md's Security section in plan.md) — full allow/deny-list evaluation logic added in Phase 3.
  - **Acceptance Criteria**: Bypass-token check is present and documented as operator-only (not reachable via any in-app action).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T010

- [ ] T013 Create `queryKeys.ts` shells
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/services/queryKeys.ts` (new), `src/features/admin/services/queryKeys.ts` (new)
  - **Goal**: Centralized factory functions for every entity these two modules query — `session()`; `users(params?)`, `user(id)`, `roles()`, `permissionGroups()`, `projectPermissions(projectId)`, `auditLog(params?)`, `securitySettings()`, `apiKeys(params?)`, `apiKeyUsage(keyId, params?)`, `systemSettings()`, `backups(projectId, params?)`, `monitoringOverview()` — no consumer ever builds a key with an inline array literal (matching every prior feature's established fix).
  - **Acceptance Criteria**: Every hook in Phase 6 imports its keys from these two files.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [ ] T014 Environment validation — required new variables
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/env.ts` (modify, or create if no existing centralized env-validation module exists — verified during implementation, not assumed)
  - **Goal**: Validate `ADMIN_SECRETS_ENCRYPTION_KEY` (required — the application MUST fail fast at startup without it, plan.md's Deployment Notes) and document `IP_RESTRICTION_BYPASS_TOKEN`/`CRON_SECRET` (optional/reused) presence checks.
  - **Acceptance Criteria**: Starting the app with `ADMIN_SECRETS_ENCRYPTION_KEY` unset fails immediately with a clear error, not a later, confusing runtime failure inside `encryption.ts`.
  - **Verification**: `npx tsc --noEmit`; manual check (start app without the var, confirm fast failure)
  - **Dependencies**: T009

- [ ] T015 [P] Update `.env.example`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `.env.example` (modify)
  - **Goal**: Document `ADMIN_SECRETS_ENCRYPTION_KEY`, `IP_RESTRICTION_BYPASS_TOKEN` (optional), and confirm `CRON_SECRET` (reused from 008) is already present or add it if 008 has not landed first.
  - **Acceptance Criteria**: Every new environment variable this feature introduces has a documented placeholder entry.
  - **Verification**: Manual review
  - **Dependencies**: T014

- [ ] T016 [P] Unit tests for Phase 1 crypto/audit utilities
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/security/__tests__/passwordHash.test.ts` (new), `src/server/security/__tests__/secretToken.test.ts` (new), `src/server/security/__tests__/encryption.test.ts` (new), `src/server/security/__tests__/auditContext.test.ts` (new)
  - **Goal**: Unit-test T007–T010 — hash/verify round-trips, token generation entropy/determinism properties, encrypt/decrypt round-trips and tamper-detection, header-extraction correctness.
  - **Acceptance Criteria**: All new tests pass, co-located under `__tests__/` (Constitution Principle VII).
  - **Verification**: `npm run test -- passwordHash secretToken encryption auditContext`
  - **Dependencies**: T007, T008, T009, T010

- [ ] T017 [P] Add `nodemailer` dependency
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `package.json`, `package-lock.json` (modify)
  - **Goal**: Install `nodemailer` (research.md Decision 8) — the platform's one new npm dependency, server-only.
  - **Acceptance Criteria**: Installs cleanly; `npm run build` still succeeds; confirmed server-only usage (no client import) at this stage (nothing imports it yet).
  - **Verification**: `npm install && npm run build`
  - **Dependencies**: None

- [ ] T018 Checkpoint (Phase 1)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm Foundation phase is complete and green before Phase 2 (Database) begins.
  - **Acceptance Criteria**: All of T001–T017 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T001–T017

---

## Phase 2: Database

**Purpose**: One modified model (`User`) and eleven new Prisma models,
per data-model.md — see the Architecture note above for how several
roadmap-outline item names map onto these.

- [ ] T019 Widen `User` — new fields
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify)
  - **Goal**: Add `systemRoleId` (FK → `SystemRole`, added nullable initially), `isActive` (default `true`), `deletedAt` exactly per data-model.md.
  - **Acceptance Criteria**: `prisma validate` passes; no existing `User` field changes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T003

- [ ] T020 [P] Add `UserCredential` model (covers "User Profile" auth data)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add `UserCredential` exactly per data-model.md — `passwordHash`, `passwordUpdatedAt`, `passwordResetTokenHash`/`passwordResetExpiresAt`, `mfaEnabled`, `mfaSecretEncrypted` (reserved).
  - **Acceptance Criteria**: `prisma validate` passes; `@@unique([userId])` present.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T019

- [ ] T021 [P] Add `Session` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add `Session` exactly per data-model.md — `tokenHash` (unique), `isPersistent`, `expiresAt`, `lastActivityAt`, `ipAddress`/`userAgent`.
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T019

- [ ] T022 [P] Add `SystemRole` model (covers "Role")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add `SystemRole` exactly per data-model.md — `key` (unique), `name`, `isBuiltIn`.
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T019

- [ ] T023 [P] Add `PermissionGroup` model (covers "Permission")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add `PermissionGroup` exactly per data-model.md — `key` (unique, matching T002's constants), `name`, `description`.
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T002, T019

- [ ] T024 [P] Add `SystemRolePermissionGroup` join model (covers "RolePermission")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add the composite-primary-key join table exactly per data-model.md — this is the real many-to-many table in this feature's RBAC design (roles ↔ permission groups); confirms no separate "UserRole" join table is created (data-model.md — a user has exactly one `systemRoleId`, a plain FK).
  - **Acceptance Criteria**: `prisma validate` passes; `@@id([systemRoleId, permissionGroupId])` present.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T022, T023

- [ ] T025 "UserRole" confirmation — single FK, not a join table
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (verify, from T019/T022)
  - **Goal**: Confirm `User.systemRoleId` (T019) is the complete implementation of the roadmap outline's "UserRole" item — document explicitly that no separate join table exists, since a user has exactly one system role at a time (research.md Decision 5).
  - **Acceptance Criteria**: No `UserRole` model exists in the schema.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T019, T022

- [ ] T026 "ProjectPermission"/"LayerPermission" confirmation — reuse 006, no new tables
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (documentation-only task)
  - **Goal**: Confirm project-level permission data is 006-collaboration's existing `ProjectMember` table (not duplicated here), and that no per-layer ACL table is introduced — spec.md's US4 AC2 explicitly frames layer-level restriction as conditional ("if configured"), and no such per-layer mechanism exists anywhere in this codebase to extend. Documented here rather than silently omitted.
  - **Acceptance Criteria**: No `ProjectPermission`/`LayerPermission` model exists in the schema.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: None

- [ ] T027 Add `SecurityAuditLog` model (covers "AuditLog", "SecurityEvent", "LoginHistory")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add `SecurityAuditLog` exactly per data-model.md — `eventType`, `category` (the "SecurityEvent" distinction, a column not a table), `userId`/`attemptedEmail` (the "LoginHistory" data, folded in, not a separate table), `actorUserId`, `targetType`/`targetId`, `metadata`, `ipAddress`.
  - **Acceptance Criteria**: `prisma validate` passes; both `userId` and `actorUserId` relations to `User` use distinct named relations (`onDelete: SetNull` each).
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T019

- [ ] T028 [P] Add `SecuritySettings` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add the `SecuritySettings` singleton exactly per data-model.md — fixed `id: "singleton"`, password policy/session/rate-limit/IP-list fields.
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T001, T019

- [ ] T029 [P] Add `ApiKey` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add `ApiKey` exactly per data-model.md — `secretHash` (unique), `scope` (string array), `projectId` (optional), `expiresAt`/`revokedAt`, `rotatedFromKeyId` self-relation.
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T019

- [ ] T030 [P] Add `ApiKeyUsageLog` model (covers "ApiKeyUsage")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add `ApiKeyUsageLog` exactly per data-model.md — `apiKeyId`, `endpoint`, `statusCode`.
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T029

- [ ] T031 [P] Add `SystemSettings` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add the `SystemSettings` singleton exactly per data-model.md — general/storage/map-default/SMTP/backup-schedule fields, `smtpPasswordEncrypted` (never plaintext).
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T019

- [ ] T032 [P] Add `Backup` model (covers "BackupHistory" — the table itself is the history)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add `Backup` exactly per data-model.md — `trigger`, `status`, `fileContent Bytes?`, `sizeBytes`, `errorMessage`.
  - **Acceptance Criteria**: `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T019

- [ ] T033 Add indexes audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (verify, same file as T019)
  - **Goal**: Cross-check every index data-model.md specifies is present across all twelve schema changes.
  - **Acceptance Criteria**: 1:1 match against data-model.md's per-entity "Indexes" sections.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T019–T032

- [ ] T034 Add back-relations to `User` and `Project`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T019)
  - **Goal**: Add `credential`, `sessions`, `apiKeys`, `backups` to `User`; `apiKeys`, `backups` to `Project`, exactly per data-model.md.
  - **Acceptance Criteria**: `prisma validate` passes; no existing field on either model changes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T020, T021, T029, T032

- [ ] T035 Generate and apply the migration
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_administration_security/migration.sql` (generated)
  - **Goal**: Run `prisma migrate dev` — `User.systemRoleId` added nullable, backfilled (T036), then tightened to `NOT NULL` in the same migration, per data-model.md's Migration notes; every new table created.
  - **Acceptance Criteria**: Migration applies cleanly against the test database; zero change to any pre-existing column beyond `User`'s three new fields.
  - **Verification**: `npx prisma migrate status`
  - **Dependencies**: T033, T034

- [ ] T036 Backfill `User.systemRoleId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_administration_security/migration.sql` (edited, same migration as T035)
  - **Goal**: Backfill every pre-existing `User` row with a seeded default "Editor" `SystemRole` before tightening the column to `NOT NULL` (data-model.md's Migration notes) — real role reassignment is an administrator's post-migration action, not automated here.
  - **Acceptance Criteria**: Every pre-existing `User` row has a non-null `systemRoleId` after migration; migration fails loudly if any row cannot be backfilled.
  - **Verification**: `npx prisma migrate status`; row-count spot check documented in T039
  - **Dependencies**: T035

- [ ] T037 [P] Update `prisma/seed.ts` — RBAC catalog
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/seed.ts` (modify)
  - **Goal**: Idempotently seed the four built-in `SystemRole`s, the full `PermissionGroup` catalog (T002's constants), and their `SystemRolePermissionGroup` assignments (Admin gets every group; Manager gets `manage_users`/`view_audit_logs`/`manage_permissions` per spec.md's documented default split; Editor/Viewer get none).
  - **Acceptance Criteria**: Re-running the seed script does not duplicate rows.
  - **Verification**: Run the project's seed command against the test database
  - **Dependencies**: T035

- [ ] T038 [P] Update `prisma/seed.ts` — singleton settings + bootstrap Admin
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/seed.ts` (modify, same file as T037)
  - **Goal**: Seed the singleton `SecuritySettings`/`SystemSettings` rows with documented defaults, and the bootstrap Admin `User` + `UserCredential` (research.md Decision 18) — the one seed-time path that establishes the platform's first Admin.
  - **Acceptance Criteria**: A fresh environment running only the seed script ends up with exactly one Admin-role user.
  - **Verification**: Run the project's seed command against the test database
  - **Dependencies**: T037

- [ ] T039 [P] Database-level tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/__tests__/schema.migration.test.ts` (new, or the project's existing DB-test location/convention)
  - **Goal**: Automated smoke test asserting the migration applies cleanly, the `systemRoleId` backfill (T036) leaves zero null rows, and the seed script (T037/T038) produces exactly one Admin.
  - **Acceptance Criteria**: Test passes against the real ephemeral PostGIS test database, skip-if-unavailable.
  - **Verification**: `npm run test:db` (if present) or `npm run test -- schema.migration`
  - **Dependencies**: T035, T036, T038

- [ ] T040 Checkpoint (Phase 2)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the schema/migration/seed layer is complete and green before Phase 3 (Repository Layer) begins.
  - **Acceptance Criteria**: All of T019–T039 complete; `prisma validate` and `prisma migrate status` both clean.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T019–T039

---

## Phase 3: Repository Layer

**Purpose**: Nine new repository files per repository-api.md, each owning
one primary table-group. "UserRepository" from the roadmap outline splits
into `authRepository.ts` + `userManagementRepository.ts`; "SecurityRepository"
maps to `securitySettingsRepository.ts`; "SettingsRepository" maps to
`systemSettingsRepository.ts` — see the Architecture note above.

- [ ] T041 Create `authRepository.ts` — credential creation + password verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/authRepository.ts` (new)
  - **Goal**: Implement `createUserWithCredential`, `verifyPassword` exactly per contracts/repository-api.md, using T007's `passwordHash.ts`.
  - **Acceptance Criteria**: `verifyPassword` returns `null` identically for "no such user" and "wrong password" (FR-006 non-disclosure).
  - **Verification**: `npx tsc --noEmit`; covered by T059
  - **Dependencies**: T007, T020

- [ ] T042 [P] `authRepository.ts` — session lifecycle
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/authRepository.ts` (modify, same file as T041)
  - **Goal**: Implement `createSession`, `validateSession` (checks `expiresAt` **and** `User.isActive` on every call, spec Edge Cases), `deleteSession`, `deleteAllSessionsForUser` using T008's `secretToken.ts`.
  - **Acceptance Criteria**: A deactivated user's existing session fails `validateSession` on its very next check.
  - **Verification**: `npx tsc --noEmit`; covered by T059
  - **Dependencies**: T008, T021, T041

- [ ] T043 [P] `authRepository.ts` — password reset tokens
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/authRepository.ts` (modify, same file as T041)
  - **Goal**: Implement `issuePasswordSetupToken`/`issuePasswordResetToken`, `consumePasswordResetToken` (validates not-expired/not-used, hashes new password, clears token, calls `deleteAllSessionsForUser`).
  - **Acceptance Criteria**: A second use of the same token, or a use after expiry, is rejected.
  - **Verification**: `npx tsc --noEmit`; covered by T059
  - **Dependencies**: T008, T042

- [ ] T044 Create `userManagementRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/userManagementRepository.ts` (new)
  - **Goal**: Implement `listUsers` (never selects `passwordHash`), `updateUser`, `softDeleteUser`, `getMyProfile`/`updateMyProfile` exactly per contracts/repository-api.md — every user-mutating function checks the FR-010 last-Admin invariant before committing.
  - **Acceptance Criteria**: Attempting to deactivate/delete/role-change the platform's sole remaining Admin throws `ValidationError` before any write.
  - **Verification**: `npx tsc --noEmit`; covered by T059
  - **Dependencies**: T019, T041

- [ ] T045 Create `roleRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/roleRepository.ts` (new)
  - **Goal**: Implement `listRoles`/`listPermissionGroups`, `createRole`, `updateRole` (throws `ForbiddenError` for `isBuiltIn`), `deleteRole` (throws `ValidationError` if in use, `ForbiddenError` if built-in) exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: FR-011/FR-012/FR-013 all satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T059
  - **Dependencies**: T022, T023, T024

- [ ] T046 Create `assertSystemPermission.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/auth/assertSystemPermission.ts` (new)
  - **Goal**: Implement per research.md Decision 6/plan.md's Architecture — checks the resolved user's `SystemRole`'s `PermissionGroup`s (via `roleRepository`), throws `ForbiddenError` if the required group is absent, in the exact position `assertProjectRole` (006) occupies for project-scoped endpoints.
  - **Acceptance Criteria**: Every administrative Route Handler (Phase 4) calls this before any repository write.
  - **Verification**: `npx tsc --noEmit`; covered by T059
  - **Dependencies**: T004, T045

- [ ] T047 Create `permissionRepository.ts` — project/dashboard composition
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/permissionRepository.ts` (new)
  - **Goal**: Implement `getProjectPermissionsView`, `updateProjectMemberRole` (pass-through to 006's existing membership-role-change function — **prerequisite**: 006-collaboration's `membershipRepository.ts` must exist; reuse if landed, else implement per 006's already-designed contract as the shared prerequisite plan.md's Complexity Tracking flags), `updateDashboardShare` (pass-through to 008's `dashboardShareRepository.grantShare` — same landed-or-implement-as-prerequisite note) exactly per contracts/repository-api.md — no new permission-storage of its own.
  - **Acceptance Criteria**: Zero duplicate project-role/dashboard-share storage exists in this feature's schema.
  - **Verification**: `npx tsc --noEmit`; covered by T059
  - **Dependencies**: T026, T046

- [ ] T048 [P] `permissionRepository.ts` — default policy
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/permissionRepository.ts` (modify, same file as T047)
  - **Goal**: Implement `getDefaultPolicy`/`updateDefaultPolicy` per contracts/repository-api.md, reading/writing fields on `SystemSettings` (T031) where the fixed-settings pattern fits (repository-api.md's documented note on this being resolved at implementation time if the shape grows more open-ended).
  - **Acceptance Criteria**: FR-016 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T059
  - **Dependencies**: T031, T047

- [ ] T049 Create `securityAuditRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/securityAuditRepository.ts` (new)
  - **Goal**: Implement `recordSecurityEvent` (called inside the same transaction as the action it records, mirroring `Activity`'s append-only rule), `listAuditLog` (merges `SecurityAuditLog` with 006's `Activity` chronologically, research.md Decision 10), `exportAuditLog` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: `listAuditLog` never writes into either source table — read-only merge.
  - **Verification**: `npx tsc --noEmit`; covered by T060
  - **Dependencies**: T010, T027

- [ ] T050 Create `securitySettingsRepository.ts` (covers "SecurityRepository")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/securitySettingsRepository.ts` (new)
  - **Goal**: Implement `getSecuritySettings` (defensive upsert-on-first-read), `updateSecuritySettings` (writes a `SecurityAuditLog` row in the same transaction, FR-024) exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: FR-020–024 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T060
  - **Dependencies**: T028, T049

- [ ] T051 Complete `assertIpAllowed.ts` — full allow/deny-list logic
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/security/assertIpAllowed.ts` (modify, from T012's shell)
  - **Goal**: Reads `SecuritySettings.ipAllowList`/`ipDenyList` (via T050) and rejects a disallowed request before authentication runs (research.md Decision 11, FR-023).
  - **Acceptance Criteria**: FR-023 satisfied; the break-glass bypass (T012) still functions.
  - **Verification**: `npx tsc --noEmit`; covered by T060
  - **Dependencies**: T012, T050

- [ ] T052 Create `apiKeyRepository.ts` — creation + validation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/apiKeyRepository.ts` (new)
  - **Goal**: Implement `createApiKey` (validates `scope ⊆` the user's current role's groups, FR-026), `validateApiKeyRequest` (live re-intersection against the owner's **current** role, research.md Decision 9) exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: A key's effective scope reflects the owner's role at request time, not creation time.
  - **Verification**: `npx tsc --noEmit`; covered by T060
  - **Dependencies**: T008, T029, T045

- [ ] T053 [P] `apiKeyRepository.ts` — rotation, revocation, usage
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/apiKeyRepository.ts` (modify, same file as T052)
  - **Goal**: Implement `rotateApiKey`, `updateApiKey`/`revokeApiKey`, `recordApiKeyUsage` (best-effort, not transaction-coupled, data-model.md's deliberate exception), `listApiKeyUsage` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: FR-027/FR-028 satisfied; a logging failure in `recordApiKeyUsage` never blocks the request it logs.
  - **Verification**: `npx tsc --noEmit`; covered by T060
  - **Dependencies**: T030, T052

- [ ] T054 Create `systemSettingsRepository.ts` (covers "SettingsRepository")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/systemSettingsRepository.ts` (new)
  - **Goal**: Implement `getSystemSettings` (never decrypts `smtpPasswordEncrypted` for a read), `updateSystemSettings` (encrypts via T009, writes a `SecurityAuditLog` row) exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: FR-029–031 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T060
  - **Dependencies**: T009, T031, T049

- [ ] T055 [P] `systemSettingsRepository.ts` — test email
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/systemSettingsRepository.ts` (modify, same file as T054)
  - **Goal**: Implement `sendTestEmail` using `nodemailer` (T017) with the decrypted current settings; never persists or logs the decrypted credential (FR-032).
  - **Acceptance Criteria**: FR-032 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T060
  - **Dependencies**: T017, T054

- [ ] T056 Create `backupRepository.ts` — creation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/backupRepository.ts` (new)
  - **Goal**: Implement `createBackup` — calls `layerRepository`/`featureRepository`/`dashboardRepository`/`widgetRepository` directly (research.md Decision 15; **prerequisite**: 008's `dashboardRepository.ts`/`widgetRepository.ts` must exist for the dashboard-config portion, reused-if-landed or implemented-as-prerequisite per the same sequencing note as T047), chunked/streamed assembly for large projects (plan.md's Performance section), enforces the retention cap.
  - **Acceptance Criteria**: FR-033 satisfied; retention cap prunes the oldest `Backup` beyond `SystemSettings.backupRetentionCount`.
  - **Verification**: `npx tsc --noEmit`; covered by T061
  - **Dependencies**: T032, T054

- [ ] T057 [P] `backupRepository.ts` — listing, download, restore
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/backupRepository.ts` (modify, same file as T056)
  - **Goal**: Implement `listBackupsForProject`, `getBackupFileForDownload`, `restoreProject` (single transaction, rolls back entirely on any failure, FR-037) exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: A deliberately malformed backup file leaves the target project provably unchanged.
  - **Verification**: `npx tsc --noEmit`; covered by T061
  - **Dependencies**: T056

- [ ] T058 [P] `backupRepository.ts` — scheduled run-due
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/backupRepository.ts` (modify, same file as T056)
  - **Goal**: Implement `runDueScheduledBackups` — per-project failure isolation, mirroring 008's `runDueScheduledReports` (research.md Decision 16; same landed-or-prerequisite note as T047/T056 for reusing 008's exact pattern).
  - **Acceptance Criteria**: One project's backup failure never aborts another's in the same batch run.
  - **Verification**: `npx tsc --noEmit`; covered by T061
  - **Dependencies**: T056

- [ ] T059 [P] Repository tests — auth/user-management/role/permission
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/authRepository.test.ts` (new), `src/server/repositories/__tests__/userManagementRepository.test.ts` (new), `src/server/repositories/__tests__/roleRepository.test.ts` (new), `src/server/repositories/__tests__/permissionRepository.test.ts` (new)
  - **Goal**: Test T041–T048, including every angle of the last-Admin-protection invariant (deactivate/delete/role-change attempts against the sole Admin), against the real PostGIS test database.
  - **Acceptance Criteria**: Every function in contracts/repository-api.md's auth/user-management/role/permission sections has at least one passing success test and one failure/edge-case test.
  - **Verification**: `npm run test:db -- authRepository userManagementRepository roleRepository permissionRepository`
  - **Dependencies**: T041–T048

- [ ] T060 [P] Repository tests — audit/security-settings/api-key/system-settings
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/securityAuditRepository.test.ts` (new), `src/server/repositories/__tests__/securitySettingsRepository.test.ts` (new), `src/server/repositories/__tests__/apiKeyRepository.test.ts` (new), `src/server/repositories/__tests__/systemSettingsRepository.test.ts` (new)
  - **Goal**: Test T049–T055, including the API key downgraded-owner scope re-check (spec Edge Cases).
  - **Acceptance Criteria**: Matches contracts/repository-api.md's documented behavior for each function.
  - **Verification**: `npm run test:db -- securityAuditRepository securitySettingsRepository apiKeyRepository systemSettingsRepository`
  - **Dependencies**: T049–T055

- [ ] T061 [P] Repository tests — backup
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/backupRepository.test.ts` (new)
  - **Goal**: Test T056–T058, including a deliberately corrupted-backup restore-failure data-integrity assertion (FR-037).
  - **Acceptance Criteria**: Matches contracts/repository-api.md's documented behavior.
  - **Verification**: `npm run test:db -- backupRepository`
  - **Dependencies**: T056, T057, T058

- [ ] T062 Create `monitoringRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/monitoringRepository.ts` (new)
  - **Goal**: Implement `getMonitoringOverview` (extends 008's `dashboardAnalyticsRepository` compute-if-stale pattern platform-wide, research.md Decision 17; same landed-or-prerequisite note), `checkHealth` (one cheap query, no auth) exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: FR-038/FR-039 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T063
  - **Dependencies**: T027, T053

- [ ] T063 [P] Repository tests — monitoring
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/monitoringRepository.test.ts` (new)
  - **Goal**: Test T062.
  - **Acceptance Criteria**: `checkHealth` returns `"ok"` against a working test database connection.
  - **Verification**: `npm run test:db -- monitoringRepository`
  - **Dependencies**: T062

- [ ] T064 Wire `assertIpAllowed`/rate-limit buckets into the shared Route Handler helper chain
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/http/assertWriteRateLimit.ts` (verify, from T011), `src/server/security/assertIpAllowed.ts` (verify, from T051)
  - **Goal**: Confirm both are ready to be called first, in order, from every Phase 4 Route Handler — this task is the final pre-Phase-4 readiness check, not new logic.
  - **Acceptance Criteria**: Both functions are exported and independently unit-tested (T016, T060/T051's coverage) before any Route Handler calls them.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T011, T051

- [ ] T065 Checkpoint (Phase 3)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the repository layer is complete and green before Phase 4 (Route Handlers) begins.
  - **Acceptance Criteria**: All of T041–T064 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T041–T064

---

## Phase 4: Route Handlers

**Purpose**: ~30 Route Handler files for every **administrative**
resource family per api-contracts.md (Users/Roles/Permissions/API Keys/
Audit/Security-Settings/Backup/System-Settings/Monitoring/Health). The
actual **authentication flow endpoints** (`/api/auth/*`) are built in
Phase 11 alongside US1's other authentication behavior, matching how
007/008 kept operation-specific route wiring inside their story phases —
this phase covers the generic administrative CRUD surface only.

- [ ] T066 `GET`/`POST /api/admin/users`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/users/route.ts` (new)
  - **Goal**: List/search (FR-007) and admin-create (US1 AC1's setup-link path) per api-contracts.md; `assertSystemPermission(..., "manage_users")`.
  - **Acceptance Criteria**: Matches documented request/response/error shapes exactly.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T044, T046

- [ ] T067 [P] `PATCH`/`DELETE /api/admin/users/:userId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/users/[userId]/route.ts` (new)
  - **Goal**: Update (deactivate/reactivate/role-change)/soft-delete per api-contracts.md.
  - **Acceptance Criteria**: Last-Admin protection's `400` surfaces correctly.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T044, T046

- [ ] T068 [P] `GET`/`PATCH /api/users/me`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/users/me/route.ts` (new)
  - **Goal**: Self-service profile (FR-009), no `manage_users` permission required.
  - **Acceptance Criteria**: A user can only ever read/update their own row via this endpoint.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T044

- [ ] T069 [P] `GET`/`POST /api/admin/roles`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/roles/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-012); `assertSystemPermission(..., "manage_roles")`.
  - **Acceptance Criteria**: Matches documented shapes.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T045, T046

- [ ] T070 [P] `PATCH`/`DELETE /api/admin/roles/:roleId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/roles/[roleId]/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-013); built-in-role protection.
  - **Acceptance Criteria**: `403` for a built-in-role modification attempt.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T045, T046

- [ ] T071 [P] `GET /api/admin/permission-groups`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/permission-groups/route.ts` (new)
  - **Goal**: Per api-contracts.md.
  - **Acceptance Criteria**: Returns the full seeded catalog.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T045

- [ ] T072 [P] `GET /api/admin/permissions/projects/:projectId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/permissions/projects/[projectId]/route.ts` (new)
  - **Goal**: Per api-contracts.md (US4 AC1/3); `assertSystemPermission(..., "manage_permissions")`.
  - **Acceptance Criteria**: Matches documented shape.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T047, T046

- [ ] T073 [P] `PATCH /api/admin/permissions/projects/:projectId/members/:userId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/permissions/projects/[projectId]/members/[userId]/route.ts` (new)
  - **Goal**: Per api-contracts.md.
  - **Acceptance Criteria**: Matches documented shape.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T047

- [ ] T074 [P] `PATCH /api/admin/permissions/dashboards/:dashboardId/shares/:userId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/permissions/dashboards/[dashboardId]/shares/[userId]/route.ts` (new)
  - **Goal**: Per api-contracts.md.
  - **Acceptance Criteria**: Matches documented shape.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T047

- [ ] T075 [P] `GET`/`PATCH /api/admin/permissions/default-policy`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/permissions/default-policy/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-016).
  - **Acceptance Criteria**: Matches documented shape.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T048

- [ ] T076 [P] `GET /api/admin/audit-log`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/audit-log/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-017–019); `assertSystemPermission(..., "view_audit_logs")`.
  - **Acceptance Criteria**: Response merges `SecurityAuditLog` and `Activity` correctly.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T049, T046

- [ ] T077 [P] `POST /api/admin/audit-log/export`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/audit-log/export/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-019).
  - **Acceptance Criteria**: Matches documented shape.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T049

- [ ] T078 [P] `GET`/`PATCH /api/admin/security-settings`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/security-settings/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-020–024); `assertSystemPermission(..., "manage_security_settings")`.
  - **Acceptance Criteria**: `PATCH` writes an audit entry in the same transaction.
  - **Verification**: `npx tsc --noEmit`; covered by T090
  - **Dependencies**: T050, T046

- [ ] T079 [P] `GET`/`POST /api/api-keys`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/api-keys/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-025) — self-service (own keys) with `manage_api_keys` override for another user's.
  - **Acceptance Criteria**: `secret` present only in the creation response.
  - **Verification**: `npx tsc --noEmit`; covered by T091
  - **Dependencies**: T052

- [ ] T080 [P] `POST /api/api-keys/:keyId/rotate`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/api-keys/[keyId]/rotate/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-027).
  - **Acceptance Criteria**: New secret shown once; old immediately invalid.
  - **Verification**: `npx tsc --noEmit`; covered by T091
  - **Dependencies**: T053

- [ ] T081 [P] `PATCH`/`DELETE /api/api-keys/:keyId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/api-keys/[keyId]/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-027).
  - **Acceptance Criteria**: Matches documented shapes.
  - **Verification**: `npx tsc --noEmit`; covered by T091
  - **Dependencies**: T053

- [ ] T082 [P] `GET /api/api-keys/:keyId/usage`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/api-keys/[keyId]/usage/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-028).
  - **Acceptance Criteria**: Matches documented shape.
  - **Verification**: `npx tsc --noEmit`; covered by T091
  - **Dependencies**: T053

- [ ] T083 [P] `GET`/`PATCH /api/admin/system-settings`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/system-settings/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-029–031); `assertSystemPermission(..., "manage_system_settings")`.
  - **Acceptance Criteria**: `smtpPasswordEncrypted` never in the response.
  - **Verification**: `npx tsc --noEmit`; covered by T091
  - **Dependencies**: T054, T046

- [ ] T084 [P] `POST /api/admin/system-settings/test-email`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/system-settings/test-email/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-032).
  - **Acceptance Criteria**: Matches documented shape.
  - **Verification**: `npx tsc --noEmit`; covered by T091
  - **Dependencies**: T055

- [ ] T085 [P] `GET`/`POST /api/projects/:projectId/backups`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/backups/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-033); project Owner or `manage_backups`.
  - **Acceptance Criteria**: Matches documented shapes.
  - **Verification**: `npx tsc --noEmit`; covered by T091
  - **Dependencies**: T056, T057

- [ ] T086 [P] `GET /api/backups/:backupId/download`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/backups/[backupId]/download/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-035).
  - **Acceptance Criteria**: `404` for a failed backup with no `fileContent`.
  - **Verification**: `npx tsc --noEmit`; covered by T091
  - **Dependencies**: T057

- [ ] T087 [P] `POST /api/backups/:backupId/restore`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/backups/[backupId]/restore/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-036/037) — `confirmOverwrite` required when target has newer data.
  - **Acceptance Criteria**: Matches documented conflict/confirmation shape.
  - **Verification**: `npx tsc --noEmit`; covered by T091
  - **Dependencies**: T057

- [ ] T088 [P] `POST /api/backups/scheduled/run-due`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/backups/scheduled/run-due/route.ts` (new)
  - **Goal**: Per api-contracts.md and research.md Decision 16 — `X-Cron-Secret` authenticated, not `getCurrentUser`.
  - **Acceptance Criteria**: `401` on missing/incorrect secret; idempotent on repeat calls.
  - **Verification**: `npx tsc --noEmit`; covered by T091
  - **Dependencies**: T058

- [ ] T089 [P] `GET /api/admin/monitoring/overview` + `GET /api/health`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/monitoring/overview/route.ts` (new), `src/app/api/health/route.ts` (new)
  - **Goal**: Per api-contracts.md (FR-038/039); `/api/health` unauthenticated.
  - **Acceptance Criteria**: `/api/health` never calls `getCurrentUser`.
  - **Verification**: `npx tsc --noEmit`; covered by T091
  - **Dependencies**: T062

- [ ] T090 [P] API tests — users/roles/permissions/audit/security-settings
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/admin/__tests__/users.api.test.ts` (new), `src/app/api/admin/__tests__/roles.api.test.ts` (new), `src/app/api/admin/__tests__/permissions.api.test.ts` (new), `src/app/api/admin/__tests__/auditLog.api.test.ts` (new), `src/app/api/admin/__tests__/securitySettings.api.test.ts` (new)
  - **Goal**: Test T066–T078 — success, validation failure, `403`, `404`, `429`.
  - **Acceptance Criteria**: Every row of api-contracts.md's error table for these endpoints has a corresponding test case.
  - **Verification**: `npm run test:db -- users.api roles.api permissions.api auditLog.api securitySettings.api`
  - **Dependencies**: T066–T078

- [ ] T091 [P] API tests — api-keys/system-settings/backups/monitoring/health
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/apiKeys.api.test.ts` (new), `src/app/api/admin/__tests__/systemSettings.api.test.ts` (new), `src/app/api/__tests__/backups.api.test.ts` (new), `src/app/api/admin/__tests__/monitoring.api.test.ts` (new), `src/app/api/__tests__/health.api.test.ts` (new)
  - **Goal**: Test T079–T089, including the `run-due` endpoint's shared-secret auth and per-project failure isolation.
  - **Acceptance Criteria**: Every row of api-contracts.md's error table for these endpoints has a corresponding test case.
  - **Verification**: `npm run test:db -- apiKeys.api systemSettings.api backups.api monitoring.api health.api`
  - **Dependencies**: T079–T089

- [ ] T092 Extend structured logging across all new routes
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: All route files touched in T066–T089
  - **Goal**: Confirm every route calls `logger.request` with method/path/status/duration (existing convention) — no route in this feature skips structured logging.
  - **Acceptance Criteria**: Matches Constitution's Logging standard.
  - **Verification**: `npx eslint src/app/api --max-warnings 0`
  - **Dependencies**: T066–T089

- [ ] T093 Confirm `ForbiddenError`/`FORBIDDEN` mapping across all new routes
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: All route files touched in T066–T089
  - **Goal**: Confirm every route's `catch` block correctly maps a thrown `ForbiddenError` (T006) to `403 FORBIDDEN` via `handleRouteError`.
  - **Acceptance Criteria**: No route returns a bare `500` for an authorization failure.
  - **Verification**: Covered by T090/T091
  - **Dependencies**: T006, T066–T089

- [ ] T094 Fill in full request-body Zod validation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/userManagement.schema.ts`, `role.schema.ts`, `securitySettings.schema.ts`, `apiKey.schema.ts`, `systemSettings.schema.ts`, `backup.schema.ts` (all modify, from T005)
  - **Goal**: Replace T005's shells with full field validation matching api-contracts.md's request bodies exactly.
  - **Acceptance Criteria**: Every field documented in api-contracts.md has a matching Zod constraint.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T005

- [ ] T095 Checkpoint (Phase 4)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the administrative HTTP surface is complete and green before Phase 5 (Client Services) begins.
  - **Acceptance Criteria**: All of T066–T094 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T066–T094

---

## Phase 5: Client Services

**Purpose**: Client-side HTTP wrappers for both new modules
(`src/features/auth/`, `src/features/admin/`), per contracts/client-api.md.
`authService.ts` is not named in the roadmap outline's Phase 5 list (the
outline's services are all administrative) but is a necessary addition —
Phase 6's hooks and Phase 11's UI cannot exist without it, so it is built
here for consistency with every other feature's "all client services in
one phase" convention.

- [ ] T096 Create `authService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/services/authService.ts` (new)
  - **Goal**: Implement `register`, `login`, `logout`, `requestPasswordReset`, `confirmPasswordReset`, `getSession` per contracts/client-api.md — thin `apiFetch` wrappers only.
  - **Acceptance Criteria**: No method contains business logic beyond request shaping/response parsing (Constitution Principle I).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T088 note — actually depends on Phase 11's route endpoints; see Dependencies & Execution Order for the documented exception allowing this service to be authored ahead of its routes, stubbed against api-contracts.md's already-approved shapes, and verified once Phase 11 lands

- [ ] T097 [P] Create `userManagementService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/userManagementService.ts` (new)
  - **Goal**: Implement `listUsers`, `createUser`, `updateUser`, `deleteUser`, `getMyProfile`/`updateMyProfile` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's Users/`/api/users/me` endpoints exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T066, T067, T068

- [ ] T098 [P] Create `roleService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/roleService.ts` (new)
  - **Goal**: Implement `listRoles`, `createRole`, `updateRole`, `deleteRole`, `listPermissionGroups` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's Role Management endpoints exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T069, T070, T071

- [ ] T099 [P] Create `permissionService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/permissionService.ts` (new)
  - **Goal**: Implement `getProjectPermissions`, `updateProjectMemberRole`, `updateDashboardShare`, `getDefaultPolicy`/`updateDefaultPolicy` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's Permission Management endpoints exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T072, T073, T074, T075

- [ ] T100 [P] Create `auditLogService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/auditLogService.ts` (new)
  - **Goal**: Implement `listAuditLog`, `exportAuditLog` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's Audit Log endpoints exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T076, T077

- [ ] T101 [P] Create `securitySettingsService.ts` (covers "SecurityService")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/securitySettingsService.ts` (new)
  - **Goal**: Implement `getSecuritySettings`, `updateSecuritySettings` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's Security Settings endpoints exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T078

- [ ] T102 [P] Create `apiKeyService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/apiKeyService.ts` (new)
  - **Goal**: Implement `listApiKeys`, `createApiKey`, `rotateApiKey`, `updateApiKey`, `revokeApiKey`, `getApiKeyUsage` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's API Key endpoints exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T079, T080, T081, T082

- [ ] T103 [P] Create `systemSettingsService.ts` (covers "SettingsService")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/systemSettingsService.ts` (new)
  - **Goal**: Implement `getSystemSettings`, `updateSystemSettings`, `sendTestEmail` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's System Settings endpoints exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T083, T084

- [ ] T104 [P] Create `backupService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/backupService.ts` (new)
  - **Goal**: Implement `listBackups`, `triggerBackup`, `downloadBackup`, `restoreBackup` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's Backup & Restore endpoints exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T085, T086, T087

- [ ] T105 [P] Create `monitoringService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/monitoringService.ts` (new)
  - **Goal**: Implement `getMonitoringOverview` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's Monitoring endpoint exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T089

- [ ] T106 Fill in `queryKeys.ts` factories
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/services/queryKeys.ts`, `src/features/admin/services/queryKeys.ts` (both modify, from T013)
  - **Goal**: Complete every factory function T013 declared.
  - **Acceptance Criteria**: Every hook in Phase 6 can import a matching key factory.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T013

- [ ] T107 "Retry policy" — disable retry for creating/security-sensitive mutations
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/services/authService.ts` (documented here, configured in Phase 6)
  - **Goal**: Document/enforce `retry: false` on login, user creation, API key creation, role creation, and backup-trigger mutations — an auto-retried login could double-submit against the rate limiter; an auto-retried creation could duplicate a resource, mirroring 007/008's job-creation retry precedent.
  - **Acceptance Criteria**: No creating/authenticating mutation in this feature auto-retries.
  - **Verification**: Covered by T131
  - **Dependencies**: T096, T097, T102

- [ ] T108 "Retry policy" cont'd — bounded retry/backoff for monitoring polling
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/monitoringService.ts` (documented here, configured in Phase 6)
  - **Goal**: Document/enforce a small bounded retry count with backoff for `useMonitoringOverview`'s polling requests, mirroring 007/008's polling-retry precedent.
  - **Acceptance Criteria**: A simulated transient failure does not permanently stop the health dashboard from updating.
  - **Verification**: Covered by T131
  - **Dependencies**: T105

- [ ] T109 [P] Service unit tests — auth
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/services/__tests__/authService.test.ts` (new)
  - **Goal**: Test T096's request-shaping correctness (mocked `apiFetch`).
  - **Acceptance Criteria**: Every exported method has at least one passing test.
  - **Verification**: `npm run test -- authService`
  - **Dependencies**: T096

- [ ] T110 [P] Service unit tests — user-management/role/permission
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/__tests__/userManagementService.test.ts` (new), `src/features/admin/services/__tests__/roleService.test.ts` (new), `src/features/admin/services/__tests__/permissionService.test.ts` (new)
  - **Goal**: Test T097–T099.
  - **Acceptance Criteria**: Every exported method has at least one passing test.
  - **Verification**: `npm run test -- userManagementService roleService permissionService`
  - **Dependencies**: T097, T098, T099

- [ ] T111 [P] Service unit tests — audit/security/api-key/settings/backup/monitoring
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/__tests__/auditLogService.test.ts` (new), `securitySettingsService.test.ts` (new), `apiKeyService.test.ts` (new), `systemSettingsService.test.ts` (new), `backupService.test.ts` (new), `monitoringService.test.ts` (new)
  - **Goal**: Test T100–T105.
  - **Acceptance Criteria**: Every exported method has at least one passing test.
  - **Verification**: `npm run test -- auditLogService securitySettingsService apiKeyService systemSettingsService backupService monitoringService`
  - **Dependencies**: T100, T101, T102, T103, T104, T105

- [ ] T112 Checkpoint (Phase 5)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the client service layer is complete and green before Phase 6 (React Query Hooks) begins.
  - **Acceptance Criteria**: All of T096–T111 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T096–T111

---

## Phase 6: React Query Hooks

**Purpose**: Data-fetching/mutation hooks over Phase 5's services, per
contracts/client-api.md.

- [ ] T113 Create `useAuth.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/hooks/useAuth.ts` (new)
  - **Goal**: Implement `useSession` (long `staleTime`), `useLogin` (`retry: false`, T107), `useLogout` (invalidates `session()` **and** calls `queryClient.clear()` — signing out must not leave another user's cached data visible on a shared device), `useRequestPasswordReset`/`useConfirmPasswordReset`, `useRegister` per contracts/client-api.md.
  - **Acceptance Criteria**: `useLogout`'s full-cache-clear behavior is explicit, not incidental.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T096, T106, T107

- [ ] T114 [P] Create `useUserManagement.ts` (covers "useUsers")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/hooks/useUserManagement.ts` (new)
  - **Goal**: Implement `useUsers`, `useCreateUser` (`retry: false`), `useUpdateUser`, `useDeleteUser` (both with `onError` specifically surfacing the last-Admin `400` as a distinct named error state, not a generic toast), `useMyProfile`/`useUpdateMyProfile` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches contracts/client-api.md's documented invalidation targets.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T097, T106, T107

- [ ] T115 [P] Create `useRoles.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/hooks/useRoles.ts` (new)
  - **Goal**: Implement `useRoles`, `usePermissionGroups`, `useCreateRole` (`retry: false`), `useUpdateRole`, `useDeleteRole` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches documented invalidation targets.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T098, T106

- [ ] T116 [P] Create `usePermissions.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/hooks/usePermissions.ts` (new)
  - **Goal**: Implement `useProjectPermissions`, `useUpdateProjectMemberRole`, `useUpdateDashboardShare`, `useDefaultPolicy`/`useUpdateDefaultPolicy` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches documented invalidation targets.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T099, T106

- [ ] T117 [P] Create `useAuditLog.ts` (covers "useAuditLogs")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/hooks/useAuditLog.ts` (new)
  - **Goal**: Implement `useAuditLog`, `useExportAuditLog` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches documented shape.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T100, T106

- [ ] T118 [P] "useSecurityEvents" confirmation — folded into `useAuditLog`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/hooks/useAuditLog.ts` (verification, same file as T117)
  - **Goal**: Confirm `useAuditLog`'s `category` filter param (`"security_event"`) satisfies the roadmap outline's "useSecurityEvents" item — data-model.md's `SecurityAuditLog.category` column, not a separate table/hook (Architecture note).
  - **Acceptance Criteria**: No duplicate hook created.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T117

- [ ] T119 Create `useSecuritySettings.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/hooks/useSecuritySettings.ts` (new)
  - **Goal**: Implement `useSecuritySettings`, `useUpdateSecuritySettings` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches documented invalidation targets.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T101, T106

- [ ] T120 [P] Create `useApiKeys.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/hooks/useApiKeys.ts` (new)
  - **Goal**: Implement `useApiKeys`, `useCreateApiKey` (`retry: false`), `useRotateApiKey`, `useUpdateApiKey`, `useRevokeApiKey`, `useApiKeyUsage` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches documented invalidation targets.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T102, T106, T107

- [ ] T121 Create `useSystemSettings.ts` (covers "useSettings")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/hooks/useSystemSettings.ts` (new)
  - **Goal**: Implement `useSystemSettings`, `useUpdateSystemSettings`, `useSendTestEmail` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches documented invalidation targets.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T103, T106

- [ ] T122 [P] Create `useBackups.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/hooks/useBackups.ts` (new)
  - **Goal**: Implement `useBackups`, `useTriggerBackup` (`retry: false`), `useDownloadBackup`, `useRestoreBackup` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches documented invalidation targets.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T104, T106, T107

- [ ] T123 Create `useMonitoring.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/hooks/useMonitoring.ts` (new)
  - **Goal**: Implement `useMonitoringOverview` with `refetchInterval` (matching 007/008's polling precedent) and T108's bounded retry/backoff per contracts/client-api.md.
  - **Acceptance Criteria**: The health dashboard is inherently a live view, confirmed via a passing polling-behavior test.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T105, T106, T108

- [ ] T124 Mutation hooks audit — creating actions all use `retry: false`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `useAuth.ts`, `useUserManagement.ts`, `useRoles.ts`, `useApiKeys.ts`, `useBackups.ts` (all verify, from T113–T122)
  - **Goal**: Cross-check every creating mutation across all six hook files against T107's rule — this task is the completeness audit, not new implementation.
  - **Acceptance Criteria**: 100% of creating mutations confirmed `retry: false`.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T113, T114, T115, T120, T122

- [ ] T125 Cache invalidation audit — cross-feature
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `usePermissions.ts` (verification, from T116)
  - **Goal**: Confirm `useUpdateProjectMemberRole`/`useUpdateDashboardShare` invalidate only `admin/`'s own query keys — never 006's/008's internal query keys directly (this feature reads their data via `permissionRepository`'s server-side composition, not by subscribing to their client-side caches).
  - **Acceptance Criteria**: `admin/`'s hooks invalidate only `admin/`'s own query keys.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T116

- [ ] T126 Cache invalidation audit — scoped invalidation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/hooks/*.ts` (verification)
  - **Goal**: Confirm each mutation invalidates only its own entity's list/detail keys — e.g., updating security settings does not invalidate `users`/`roles`.
  - **Acceptance Criteria**: No unnecessary cross-entity invalidation.
  - **Verification**: Covered by T129
  - **Dependencies**: T113–T123

- [ ] T127 Wire last-Admin-protection error surfacing end-to-end
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `useUserManagement.ts` (verify, from T114)
  - **Goal**: Confirm the `400 INVALID_INPUT` last-Admin error (FR-010) is distinguishable in the hook's `onError` from every other `400` case, so Phase 8's UI can render a specific, actionable message rather than a generic validation-failure toast.
  - **Acceptance Criteria**: The error's `code`/`message` shape lets the UI distinguish this specific case.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T114

- [ ] T128 Wire `dataSourceUnavailable`-equivalent handling for revoked/expired API keys
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `useApiKeys.ts` (verify, from T120)
  - **Goal**: Confirm `useApiKeyUsage`/`useApiKeys` surface a clearly-typed "revoked"/"expired" state per key, not a generic error, consistent with every prior feature's "state, not exception" pattern for an expected, non-error condition.
  - **Acceptance Criteria**: The UI (Phase 12) can render a distinct badge for revoked/expired keys without string-matching an error message.
  - **Verification**: `npx tsc --noEmit`; covered by T129
  - **Dependencies**: T120

- [ ] T129 [P] Hook tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/hooks/__tests__/useAuth.test.ts` (new), `src/features/admin/hooks/__tests__/useUserManagement.test.ts` (new), `useRoles.test.ts` (new), `usePermissions.test.ts` (new), `useAuditLog.test.ts` (new), `useSecuritySettings.test.ts` (new), `useApiKeys.test.ts` (new), `useSystemSettings.test.ts` (new), `useBackups.test.ts` (new), `useMonitoring.test.ts` (new)
  - **Goal**: Test every hook from T113–T123 — `useLogout`'s cache-clear, `useMonitoringOverview`'s polling behavior, and every mutation's cache-invalidation targets.
  - **Acceptance Criteria**: Every hook exported from Phase 6 has at least one passing test.
  - **Verification**: `npm run test -- useAuth useUserManagement useRoles usePermissions useAuditLog useSecuritySettings useApiKeys useSystemSettings useBackups useMonitoring`
  - **Dependencies**: T113–T123

- [ ] T130 Store barrel export audit prerequisite — hook re-export list
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/auth/index.ts` (new — shell), `src/features/admin/index.ts` (new — shell)
  - **Goal**: Establish the public barrel for each module, re-exporting only the hooks/types/components other features are permitted to consume — full component re-exports finalized once Phase 16 exists, but every Phase 6 hook is re-exportable from this point forward.
  - **Acceptance Criteria**: No other feature module can import a `services/`/`store/` file from either module directly; only barrel exports are reachable.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T113–T123

- [ ] T131 Checkpoint (Phase 6)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the hooks layer is complete and green before Phase 7 (Zustand Stores) begins.
  - **Acceptance Criteria**: All of T113–T130 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T113–T130

- [ ] T132 Backfill `authService.ts`'s dependency on Phase 11's routes — verification placeholder
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/services/authService.ts`, `src/features/auth/hooks/useAuth.ts` (both verify, from T096/T113)
  - **Goal**: Once Phase 11 lands its `/api/auth/*` routes, re-verify `authService.ts`/`useAuth.ts` (authored ahead of schedule in Phases 5–6 against api-contracts.md's already-approved shapes) integrate correctly end-to-end — this task exists specifically to close the loop T096 opened.
  - **Acceptance Criteria**: A live login/logout/reset round-trip succeeds through the full client→route→repository stack.
  - **Verification**: `npm run test:db -- authService useAuth` (re-run against live Phase 11 routes)
  - **Dependencies**: T096, T113, T207 *(forward reference — resolved once Phase 11 exists; see Dependencies & Execution Order)*

---

## Phase 7: Zustand Stores

**Purpose**: Client UI/configuration state. Per contracts/client-api.md
and every prior feature's precedent, the roadmap outline's "UserStore"/
"RoleStore"/"PermissionStore"/"SecurityStore"/"SettingsStore"/
"MonitoringStore" map onto exactly **two** stores (`authStore`,
`adminStore`) — every one of those six named concerns is server state
(owned by React Query, Phase 6), not client UI state, per Constitution's
Additional Standards ("Server state MUST be fetched via React Query — it
MUST NOT be copied into a Zustand store as a shadow cache").

- [ ] T133 Create `authStore.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/store/authStore.ts` (new)
  - **Goal**: Implement `lastAuthError`, `redirectAfterLogin` + `setLastAuthError`/`clearLastAuthError`, `setRedirectAfterLogin`/`clearRedirectAfterLogin` per contracts/client-api.md.
  - **Acceptance Criteria**: State mutations occur only through named store actions (Constitution Principle I); session-only, no persistence (a stale redirect target surviving a reload would be confusing, not helpful).
  - **Verification**: `npx tsc --noEmit`; covered by T141
  - **Dependencies**: None

- [ ] T134 [P] "UserStore"/"RoleStore"/"PermissionStore" confirmation — no separate stores
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `useUserManagement.ts`, `useRoles.ts`, `usePermissions.ts` (verify, from Phase 6)
  - **Goal**: Confirm user/role/permission data is owned entirely by React Query's cache (Phase 6's hooks), never mirrored into a Zustand store — satisfies the roadmap outline's three named store concerns without violating Constitution's server-state rule.
  - **Acceptance Criteria**: No `userStore.ts`/`roleStore.ts`/`permissionStore.ts` file is created.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T114, T115, T116

- [ ] T135 [P] "SecurityStore"/"SettingsStore"/"MonitoringStore" confirmation — no separate stores
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `useSecuritySettings.ts`, `useSystemSettings.ts`, `useMonitoring.ts` (verify, from Phase 6)
  - **Goal**: Same confirmation as T134, for the remaining three named store concerns.
  - **Acceptance Criteria**: No `securityStore.ts`/`settingsStore.ts`/`monitoringStore.ts` file is created.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T119, T121, T123

- [ ] T136 Create `adminStore.ts` — base field
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/store/adminStore.ts` (new)
  - **Goal**: Implement `activeSection` + `setActiveSection` per contracts/client-api.md — the one client-only concern this module has (which administrative section is active), mirroring 008's `analysisPanelStore`/`dashboardBuilderStore`-style chrome-only store precedent.
  - **Acceptance Criteria**: This store has no knowledge of user/role/permission/settings *data*, only which section is currently displayed.
  - **Verification**: `npx tsc --noEmit`; covered by T141
  - **Dependencies**: None

- [ ] T137 `adminStore.ts` — wire into `AdminShell` navigation (forward reference)
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/admin/store/adminStore.ts` (verify, same file as T136)
  - **Goal**: Confirm the store's shape matches what Phase 16's `AdminShell` component (built later) will need — a documented interface contract check, not new implementation.
  - **Acceptance Criteria**: `activeSection`'s union type (T003/T004) covers every administrative area this spec defines.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003, T136

- [ ] T138 "Persistence" — confirm both stores are session-only
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/store/authStore.ts`, `src/features/admin/store/adminStore.ts` (both verify)
  - **Goal**: Explicitly confirm neither store uses Zustand's `persist` middleware — every durable value (users, roles, settings, sessions) is server-persisted (Phases 2–4), not client-persisted.
  - **Acceptance Criteria**: No `persist` import in either store file.
  - **Verification**: Covered by T141
  - **Dependencies**: T133, T136

- [ ] T139 Store barrel export finalization
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/auth/index.ts`, `src/features/admin/index.ts` (both modify, from T130)
  - **Goal**: Add `authStore`/`adminStore`'s public selector-hook re-exports (never the raw store) to each module's barrel, matching every prior feature's "named selector hooks only, never a raw store subscription" convention.
  - **Acceptance Criteria**: No other feature module can import `authStore`/`adminStore` directly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T130, T133, T136

- [ ] T140 [P] Store JSDoc + selector narrowness audit
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `authStore.ts`, `adminStore.ts` (both verify)
  - **Goal**: Confirm every exported action carries a single-line JSDoc summary (Constitution Principle VIII) and that planned consumers (Phase 8+ components) will use narrow selectors, not whole-store hooks (Constitution Principle V).
  - **Acceptance Criteria**: Zero undocumented export.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T133, T136

- [ ] T141 [P] Store tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/store/__tests__/authStore.test.ts` (new), `src/features/admin/store/__tests__/adminStore.test.ts` (new)
  - **Goal**: Test every action from T133/T136, plus T138's negative-persistence assertion for both stores.
  - **Acceptance Criteria**: 100% of exported actions have at least one test.
  - **Verification**: `npm run test -- authStore adminStore`
  - **Dependencies**: T133, T136, T138

- [ ] T142 Create `middleware.ts` — page-level auth-gate redirect
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `middleware.ts` (new, project root)
  - **Goal**: Implement research.md Decision 12/plan.md's Architecture — checks for a valid session cookie (via a lightweight, Edge-safe presence check; full validation still happens in every Route Handler) before rendering an authenticated page route, redirecting to sign-in if absent, and to `authStore.redirectAfterLogin`'s target after a successful sign-in.
  - **Acceptance Criteria**: Middleware never substitutes for a Route Handler's own `getCurrentUser`/`assertSystemPermission` check (Constitution Principle VI) — it is a UX redirect only.
  - **Verification**: `npx tsc --noEmit`; covered by T147
  - **Dependencies**: T042, T133

- [ ] T143 [P] `middleware.ts` — public-route allowlist
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `middleware.ts` (modify, same file as T142)
  - **Goal**: Exempt `/api/health`, `/api/backups/scheduled/run-due`, `/api/auth/*`, and the sign-in/reset pages themselves from the redirect check, so an unauthenticated visitor can actually reach the sign-in flow and the two unauthenticated-by-design endpoints remain reachable.
  - **Acceptance Criteria**: No infinite-redirect loop for an unauthenticated visitor.
  - **Verification**: Covered by T147
  - **Dependencies**: T142

- [ ] T144 `authStore` ↔ `middleware.ts` redirect-target wiring
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/store/authStore.ts` (modify, from T133)
  - **Goal**: Confirm `middleware.ts`'s redirect sets a query param/cookie `LoginForm` (Phase 11) reads into `authStore.setRedirectAfterLogin`, and that a successful `useLogin` (Phase 6) navigates to that target afterward.
  - **Acceptance Criteria**: A user redirected to sign-in from a deep link lands back on that same deep link after signing in.
  - **Verification**: Covered by T147
  - **Dependencies**: T133, T142

- [ ] T145 [P] `adminStore` — permission-aware section visibility hint
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/admin/store/adminStore.ts` (modify, from T136)
  - **Goal**: Add a derived selector (not new state) narrowing `activeSection`'s available options to what the current user's `SystemRole` permission groups actually grant — a client-side UX hint only; every underlying Route Handler independently re-enforces the real check regardless (Constitution Principle VI, matching T221's precedent in 008 for read-only-mode UI gating).
  - **Acceptance Criteria**: This is a pure derived selector over already-fetched session/role data (via `useSession`, Phase 6) — no new store-held permission state, no shadow cache.
  - **Verification**: `npx tsc --noEmit`; covered by T148
  - **Dependencies**: T113, T136

- [ ] T146 Store selector hook exports finalization
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/auth/index.ts`, `src/features/admin/index.ts` (both modify, from T139)
  - **Goal**: Complete the barrel export list for every store selector hook this phase has produced (T133–T145), confirming T139's convention holds for the fully-built store surface, not just its initial two fields.
  - **Acceptance Criteria**: Every store action/selector a Phase 8+ component will need is reachable via the barrel.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T139, T144, T145

- [ ] T147 [P] `middleware.ts` tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `__tests__/middleware.test.ts` (new, project root, or co-located per the project's existing root-level test convention)
  - **Goal**: Test T142–T144's redirect/allowlist/redirect-target behavior.
  - **Acceptance Criteria**: An authenticated request to a protected page passes through unmodified; an unauthenticated one redirects; the public-route allowlist (T143) is never redirected.
  - **Verification**: `npm run test -- middleware`
  - **Dependencies**: T142, T143, T144

- [ ] T148 Checkpoint (Phase 7)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the store and middleware layer is complete and green before Phase 8 (User Management, US2) begins — this is the last cross-cutting phase before user-story-specific work starts.
  - **Acceptance Criteria**: All of T133–T147 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T133–T147

---

## Phase 8: User Management (Priority: P1) 🎯 MVP-adjacent — User Story 2

**Goal**: An administrator creates, searches, deactivates, reactivates,
and deletes user accounts; any user manages their own profile, per
spec.md US2.

**Independent Test**: Create a user, search for them, deactivate them,
reactivate them, delete them — independent of role/permission
configuration beyond the default role assigned at creation.

- [ ] T149 [US2] `UserManagementPanel` shell + `UserList`
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserManagementPanel.tsx` (new), `src/features/admin/components/UserList.tsx` (new)
  - **Goal**: List wired to `useUsers` (T114).
  - **Acceptance Criteria**: Matches spec.md's US2 framing.
  - **Verification**: `npx tsc --noEmit`; covered by T165
  - **Dependencies**: T114

- [ ] T150 [US2] `CreateUserDialog`
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/CreateUserDialog.tsx` (new)
  - **Goal**: Email/name/system-role form wired to `useCreateUser` (T114) (spec.md Acceptance Scenario US2.1, FR-007).
  - **Acceptance Criteria**: FR-007 satisfied for creation.
  - **Verification**: `npx tsc --noEmit`; covered by T165
  - **Dependencies**: T114, T149

- [ ] T151 [US2] Create User — password-setup-link confirmation
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/CreateUserDialog.tsx` (verification, same file as T150)
  - **Goal**: Confirm the created account has no password until the emailed setup link (reusing `authRepository.issuePasswordSetupToken`, Phase 3) is used — the UI never accepts a password directly for an admin-created user.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US2.1.
  - **Verification**: Covered by T169
  - **Dependencies**: T150

- [ ] T152 [US2] Update User — role/status editor
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserList.tsx` (modify, from T149)
  - **Goal**: Inline or dialog-based name/`systemRoleId` edit wired to `useUpdateUser` (T114).
  - **Acceptance Criteria**: FR-007 satisfied for update.
  - **Verification**: `npx tsc --noEmit`; covered by T165
  - **Dependencies**: T114, T149

- [ ] T153 [US2] Deactivate User action
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserList.tsx` (modify, same file as T152)
  - **Goal**: Deactivate action wired to `useUpdateUser({ isActive: false })`, gated by an `AlertDialog` confirmation (spec.md Acceptance Scenario US2.3).
  - **Acceptance Criteria**: FR-008 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T166
  - **Dependencies**: T152

- [ ] T154 [US2] Deactivate/Delete User — last-Admin error surfaced
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserList.tsx` (modify, same file as T152)
  - **Goal**: Wire T127's distinctly-typed last-Admin error into a specific, actionable message ("cannot deactivate the platform's last administrator"), not a generic validation toast (FR-010, spec Edge Cases).
  - **Acceptance Criteria**: The message is specific enough that a user immediately understands why the action was blocked.
  - **Verification**: Covered by T166
  - **Dependencies**: T127, T153

- [ ] T155 [US2] Activate User action
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserList.tsx` (modify, same file as T152)
  - **Goal**: Reactivate action wired to `useUpdateUser({ isActive: true })` (spec.md Acceptance Scenario US2.4).
  - **Acceptance Criteria**: FR-008 satisfied for reactivation.
  - **Verification**: `npx tsc --noEmit`; covered by T166
  - **Dependencies**: T152

- [ ] T156 [US2] Delete User action + confirmation
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserList.tsx` (modify, same file as T152)
  - **Goal**: Delete action wired to `useDeleteUser` (T114), gated by an `AlertDialog` confirmation (spec.md Acceptance Scenario US2.5).
  - **Acceptance Criteria**: FR-007 satisfied for deletion; deletion never proceeds without explicit confirmation.
  - **Verification**: `npx tsc --noEmit`; covered by T166
  - **Dependencies**: T114, T152

- [ ] T157 [US2] Delete User — last-Admin protection UI
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserList.tsx` (verification, same file as T152)
  - **Goal**: Confirm T154's error-surfacing covers the delete path too, not only deactivate/role-change.
  - **Acceptance Criteria**: Consistent messaging across all three last-Admin-protected actions.
  - **Verification**: Covered by T166
  - **Dependencies**: T154, T156

- [ ] T158 [US2] `UserSearchBar`
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserSearchBar.tsx` (new)
  - **Goal**: Search input wired to `useUsers`'s `search` param (T114) (spec.md Acceptance Scenario US2.2, SC-005).
  - **Acceptance Criteria**: FR-007 satisfied for search.
  - **Verification**: `npx tsc --noEmit`; covered by T168
  - **Dependencies**: T114, T149

- [ ] T159 [US2] `UserSearchBar` — debounced input
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserSearchBar.tsx` (modify, same file as T158)
  - **Goal**: Debounce keystrokes before firing the search query, keeping SC-005's "under 5 seconds at 10,000+ users" target achievable without a request-per-keystroke flood.
  - **Acceptance Criteria**: A rapid typing sequence results in a small, bounded number of network requests, not one per keystroke.
  - **Verification**: Covered by T168
  - **Dependencies**: T158

- [ ] T160 [US2] User filters — active/role
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserList.tsx` (modify, same file as T152)
  - **Goal**: Filter controls for `isActive`/`systemRoleId`, composing with `UserSearchBar`'s query.
  - **Acceptance Criteria**: Filters and search compose correctly (both narrow the same result set).
  - **Verification**: Covered by T168
  - **Dependencies**: T158

- [ ] T161 [US2] `UserProfileEditor` — self mode
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserProfileEditor.tsx` (new)
  - **Goal**: Name/password-change form wired to `useUpdateMyProfile` (T114) (spec.md Acceptance Scenario US2.6, FR-009).
  - **Acceptance Criteria**: A password change requires the current password (repository-api.md's rule).
  - **Verification**: `npx tsc --noEmit`; covered by T167
  - **Dependencies**: T114

- [ ] T162 [US2] `UserProfileEditor` — admin-edit-another-user mode
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserProfileEditor.tsx` (modify, same file as T161)
  - **Goal**: The same component, mode-switched, reused from `UserList`'s edit action (T152) — no second, duplicate profile-editing component.
  - **Acceptance Criteria**: One component serves both self-service and administrative editing.
  - **Verification**: Covered by T167
  - **Dependencies**: T152, T161

- [ ] T163 [US2] `UserList` pagination
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserList.tsx` (modify, same file as T152)
  - **Goal**: Cursor-based pagination reusing `useUsers`'s existing pagination params, matching every prior feature's list-pagination UI convention.
  - **Acceptance Criteria**: SC-005 satisfied at scale.
  - **Verification**: Covered by T165
  - **Dependencies**: T149

- [ ] T164 [US2] Deactivated-user session-invalidation confirmation
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/UserList.tsx` (verification, same file as T152)
  - **Goal**: Confirm the deactivate action's effect is immediate for the affected user's *existing* session (Phase 3's `authRepository` already enforces this server-side, T042) — this task is the UI-visible/E2E confirmation, not new server logic.
  - **Acceptance Criteria**: Matches spec.md's Edge Case ("invalidated on their next request, not just blocked from a future sign-in").
  - **Verification**: Covered by T169
  - **Dependencies**: T042, T153

- [ ] T165 [P] [US2] Component tests — `UserList`/`CreateUserDialog`
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/__tests__/UserList.test.tsx` (new), `src/features/admin/components/__tests__/CreateUserDialog.test.tsx` (new)
  - **Goal**: Test T149–T152, T163.
  - **Acceptance Criteria**: Every listed action has a passing interaction test.
  - **Verification**: `npm run test -- UserList CreateUserDialog`
  - **Dependencies**: T150, T152, T163

- [ ] T166 [P] [US2] Component tests — deactivate/activate/delete incl. last-Admin protection
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/__tests__/UserList.lifecycle.test.tsx` (new)
  - **Goal**: Test T153–T157.
  - **Acceptance Criteria**: The last-Admin-protection message (T154) is explicitly asserted, not just "an error occurs."
  - **Verification**: `npm run test -- UserList.lifecycle`
  - **Dependencies**: T154, T155, T156, T157

- [ ] T167 [P] [US2] Component tests — `UserProfileEditor`
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/__tests__/UserProfileEditor.test.tsx` (new)
  - **Goal**: Test T161–T162's self and admin modes.
  - **Acceptance Criteria**: Both modes have passing interaction tests.
  - **Verification**: `npm run test -- UserProfileEditor`
  - **Dependencies**: T161, T162

- [ ] T168 [P] [US2] Component tests — search/filters
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/components/__tests__/UserSearchBar.test.tsx` (new)
  - **Goal**: Test T158–T160, including the debounce behavior.
  - **Acceptance Criteria**: Search and filter composition explicitly asserted.
  - **Verification**: `npm run test -- UserSearchBar`
  - **Dependencies**: T159, T160

- [ ] T169 [P] [US2] Integration test — full User Management flow
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/admin/__tests__/userManagement.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §2; asserts all of spec.md's US2 Acceptance Scenarios (1–6).
  - **Acceptance Criteria**: All 6 scenarios pass.
  - **Verification**: `npm run test -- userManagement.integration`
  - **Dependencies**: T151, T157, T162, T164

- [ ] T170 [US2] Checkpoint (Phase 8)
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US2 is fully functional and independently testable.
  - **Acceptance Criteria**: quickstart.md §2 passes end-to-end manually; all of T149–T169 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T149–T169

---

## Phase 9: Role Management (Priority: P1) — User Story 3

**Goal**: An administrator assigns platform-wide system roles and defines
custom roles from permission groups, per spec.md US3.

**Independent Test**: Assign a user the Manager role, confirm scoped
access; create a custom role from specific permission groups, confirm it
grants exactly those — independent of any specific permission-management
configuration (US4).

- [ ] T171 [US3] `RoleManagementPanel` shell + `RoleList`
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/RoleManagementPanel.tsx` (new), `src/features/admin/components/RoleList.tsx` (new)
  - **Goal**: List wired to `useRoles` (T115), showing each role's assigned permission groups.
  - **Acceptance Criteria**: Matches spec.md's US3 framing.
  - **Verification**: `npx tsc --noEmit`; covered by T183
  - **Dependencies**: T115

- [ ] T172 [US3] `RoleEditorDialog` — create
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/RoleEditorDialog.tsx` (new)
  - **Goal**: Name + permission-group checklist form wired to `useCreateRole` (T115) (spec.md Acceptance Scenario US3.4, FR-012).
  - **Acceptance Criteria**: FR-012 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T183
  - **Dependencies**: T115, T171

- [ ] T173 [US3] `RoleEditorDialog` — update
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/RoleEditorDialog.tsx` (modify, same file as T172)
  - **Goal**: Wired to `useUpdateRole` (T115), pre-filled from the selected role.
  - **Acceptance Criteria**: Editing a custom role's name/groups persists correctly.
  - **Verification**: `npx tsc --noEmit`; covered by T183
  - **Dependencies**: T172

- [ ] T174 [US3] Delete role action + confirmation
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/RoleList.tsx` (modify, from T171)
  - **Goal**: Delete action wired to `useDeleteRole` (T115), gated by an `AlertDialog` confirmation (spec.md Acceptance Scenario US3.5).
  - **Acceptance Criteria**: FR-013's blocking behavior is surfaced clearly, not as a generic error.
  - **Verification**: `npx tsc --noEmit`; covered by T184
  - **Dependencies**: T115, T171

- [ ] T175 [US3] Assign Role — role picker reused from User Management
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/UserList.tsx`, `CreateUserDialog.tsx` (verify, from Phase 8)
  - **Goal**: Confirm the role picker in T150/T152 (Phase 8) already lists every role from `useRoles` (built-in and custom alike) — no second, duplicate role-assignment UI is built here.
  - **Acceptance Criteria**: A newly created custom role (T172) immediately appears as an assignable option in Phase 8's user-creation/edit forms.
  - **Verification**: Covered by T186
  - **Dependencies**: T150, T152, T172

- [ ] T176 [US3] Remove Role — reassign-then-delete guided flow
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/RoleList.tsx` (modify, same file as T171)
  - **Goal**: When delete is blocked (T174), the error message links directly to the affected users' list (filtered by that role in T160's filter) so an administrator can reassign them without hunting.
  - **Acceptance Criteria**: A one-click path from "deletion blocked" to "see who's assigned" exists.
  - **Verification**: Covered by T184
  - **Dependencies**: T160, T174

- [ ] T177 [US3] Custom Roles — permission-group checklist
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/RoleEditorDialog.tsx` (modify, same file as T172)
  - **Goal**: Checklist UI wired to `usePermissionGroups` (T115), each item labelled with its `name`/`description`.
  - **Acceptance Criteria**: Every seeded permission group (T037) is selectable.
  - **Verification**: `npx tsc --noEmit`; covered by T185
  - **Dependencies**: T115, T172

- [ ] T178 [US3] Built-in roles shown read-only
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/RoleEditorDialog.tsx` (modify, same file as T172)
  - **Goal**: `isBuiltIn: true` roles open in a read-only view (name/groups displayed, not editable), matching the server's `403 FORBIDDEN` rejection (T070) with a client-side UX that doesn't even offer the disallowed action.
  - **Acceptance Criteria**: FR-011's "four fixed built-in roles" contract is visibly enforced in the UI, not just the API.
  - **Verification**: Covered by T184
  - **Dependencies**: T173, T178 self

- [ ] T179 [US3] `PermissionGroupList` — catalog display
  - **Priority**: Should-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/PermissionGroupList.tsx` (new)
  - **Goal**: A read-only reference view of the full permission-group catalog, independent of any specific role — useful context alongside `RoleEditorDialog`.
  - **Acceptance Criteria**: Wired to `usePermissionGroups` (T115).
  - **Verification**: `npx tsc --noEmit`; covered by T185
  - **Dependencies**: T115

- [ ] T180 [US3] Role validation — client-side mirroring `role.schema.ts`
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/RoleEditorDialog.tsx` (modify, same file as T172)
  - **Goal**: Client-side validation (name required, at least awareness of an empty-group-selection case) mirroring T094's server-side `role.schema.ts` rules — a UX nicety, never the enforcement authority (Constitution Principle VI).
  - **Acceptance Criteria**: Matches the server schema's rules exactly, no stricter and no looser.
  - **Verification**: Covered by T183
  - **Dependencies**: T094, T172

- [ ] T181 [US3] Role validation — "in use" error message
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/RoleList.tsx` (verification, same file as T171)
  - **Goal**: Confirm T174/T176's error message correctly reflects FR-013's exact condition (role currently assigned to ≥1 user), not a generic delete-failure message.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US3.5.
  - **Verification**: Covered by T184
  - **Dependencies**: T176

- [ ] T182 [US3] Manager/Editor/Viewer capability-gating confirmation
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/store/adminStore.ts` (verification, from T145)
  - **Goal**: Confirm T145's permission-aware section-visibility hint correctly reflects spec.md Acceptance Scenarios US3.2/3.3 (Manager sees Users+Audit only; Editor/Viewer see no admin navigation at all) for the seeded default permission-group assignments (T037).
  - **Acceptance Criteria**: A user assigned each of the four built-in roles sees exactly the documented navigation set.
  - **Verification**: Covered by T186
  - **Dependencies**: T037, T145

- [ ] T183 [P] [US3] Component tests — `RoleList`/`RoleEditorDialog` create/update
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/__tests__/RoleList.test.tsx` (new), `src/features/admin/components/__tests__/RoleEditorDialog.test.tsx` (new)
  - **Goal**: Test T171–T173, T180.
  - **Acceptance Criteria**: Every listed action has a passing interaction test.
  - **Verification**: `npm run test -- RoleList RoleEditorDialog`
  - **Dependencies**: T172, T173, T180

- [ ] T184 [P] [US3] Component tests — delete-in-use blocking + built-in protection
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/__tests__/RoleList.protection.test.tsx` (new)
  - **Goal**: Test T174, T176, T178, T181.
  - **Acceptance Criteria**: Both protection mechanisms (in-use, built-in) explicitly asserted.
  - **Verification**: `npm run test -- RoleList.protection`
  - **Dependencies**: T176, T178, T181

- [ ] T185 [P] [US3] Component tests — permission-group checklist
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/__tests__/PermissionGroupList.test.tsx` (new)
  - **Goal**: Test T177, T179.
  - **Acceptance Criteria**: Checklist selection state correctly maps to the submitted `permissionGroupKeys` array.
  - **Verification**: `npm run test -- PermissionGroupList`
  - **Dependencies**: T177, T179

- [ ] T186 [P] [US3] Integration test — full Role Management flow
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/__tests__/roleManagement.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §3; asserts all of spec.md's US3 Acceptance Scenarios (1–5).
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- roleManagement.integration`
  - **Dependencies**: T175, T182

- [ ] T187 [US3] Accessibility check — `RoleEditorDialog`
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/__tests__/RoleEditorDialog.a11y.test.tsx` (new)
  - **Goal**: Keyboard-only traversal + axe scan of the permission-group checklist (a common accessibility trouble spot for multi-select checklists), FR/SC-008-equivalent for this feature.
  - **Acceptance Criteria**: Zero critical/serious axe violations.
  - **Verification**: `npm run test -- RoleEditorDialog.a11y`
  - **Dependencies**: T177

- [ ] T188 [US3] Checkpoint (Phase 9)
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US2 and US3 both work independently.
  - **Acceptance Criteria**: quickstart.md §3 passes; all of T171–T187 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T171–T187

---

## Phase 10: Permission Management (Priority: P2) — User Story 4

**Goal**: An administrator reviews and manages permission grants across
the platform from one administrative surface, per spec.md US4. Per
data-model.md, "Layer Permissions"/"Feature Permissions" are **not**
separate mechanisms — this codebase has no per-layer/per-feature ACL
anywhere to administer, so both reuse the Project Permissions view
(Architecture note above); "Analysis Permissions"/"Export Permissions"
are the default-policy configuration, not a new per-analysis grant
system.

**Independent Test**: Open the permission view for a project, confirm it
accurately reflects real member roles and dashboard shares — independent
of role management configuration.

- [ ] T189 [US4] `PermissionManagementPanel` shell
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/PermissionManagementPanel.tsx` (new)
  - **Goal**: Project picker + section navigation (project/dashboard/default-policy views).
  - **Acceptance Criteria**: Matches spec.md's US4 framing.
  - **Verification**: `npx tsc --noEmit`; covered by T200
  - **Dependencies**: T116

- [ ] T190 [US4] `ProjectPermissionsView`
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/ProjectPermissionsView.tsx` (new)
  - **Goal**: Member list + role editor wired to `useProjectPermissions`/`useUpdateProjectMemberRole` (T116) — reuses 006's existing project-role data, never a duplicate store (spec.md Acceptance Scenario US4.1).
  - **Acceptance Criteria**: FR-014/FR-015 satisfied for project roles.
  - **Verification**: `npx tsc --noEmit`; covered by T200
  - **Dependencies**: T116, T189

- [ ] T191 [US4] `ProjectPermissionsView` — revoke access
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/ProjectPermissionsView.tsx` (modify, same file as T190)
  - **Goal**: A revoke action removing a member's project role entirely, distinct from changing it.
  - **Acceptance Criteria**: FR-015 satisfied for revocation.
  - **Verification**: Covered by T200
  - **Dependencies**: T190

- [ ] T192 [US4] "Layer Permissions" — confirmed reuse of `ProjectPermissionsView`
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/ProjectPermissionsView.tsx` (verification, same file as T190)
  - **Goal**: Confirm spec.md's US4 AC2 ("any layer-specific restriction beyond the project's own role model, if configured") is satisfied by this same view, since no per-layer ACL exists in this codebase to administer separately (data-model.md/Architecture note).
  - **Acceptance Criteria**: No `LayerPermissionsView` component is created.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T190

- [ ] T193 [US4] "Feature Permissions" — confirmed reuse
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/ProjectPermissionsView.tsx` (verification, same file as T190)
  - **Goal**: Same confirmation as T192 — features inherit their layer's/project's access scope; no separate feature-level ACL exists anywhere in this codebase.
  - **Acceptance Criteria**: No `FeaturePermissionsView` component is created.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T190

- [ ] T194 [US4] `DashboardPermissionsView`
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/DashboardPermissionsView.tsx` (new)
  - **Goal**: Every dashboard share (view/edit, public/private) for the selected project, visible and revocable from here, wired to `useUpdateDashboardShare` (T116) — reuses 008's existing share data (spec.md Acceptance Scenario US4.3).
  - **Acceptance Criteria**: FR-014/FR-015 satisfied for dashboard shares, without needing to open each dashboard individually.
  - **Verification**: `npx tsc --noEmit`; covered by T200
  - **Dependencies**: T116, T189

- [ ] T195 [US4] "Analysis Permissions" — default-policy control
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/DefaultPolicyEditor.tsx` (new)
  - **Goal**: A control for which system/project roles may run spatial analyses by default (spec.md Acceptance Scenario US4.4), wired to `useDefaultPolicy`/`useUpdateDefaultPolicy` (T116) — a policy setting, not a new per-analysis permission grant system.
  - **Acceptance Criteria**: FR-016 satisfied for the analysis-permission portion.
  - **Verification**: `npx tsc --noEmit`; covered by T202
  - **Dependencies**: T116, T189

- [ ] T196 [US4] "Export Permissions" — default-policy control
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/DefaultPolicyEditor.tsx` (modify, same file as T195)
  - **Goal**: Same policy-control pattern as T195, for export capability.
  - **Acceptance Criteria**: FR-016 satisfied for the export-permission portion.
  - **Verification**: Covered by T202
  - **Dependencies**: T195

- [ ] T197 [US4] Permission Matrix — combined view
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/PermissionMatrix.tsx` (new)
  - **Goal**: One table combining project role + dashboard shares + analysis/export default policy for a selected project, satisfying the roadmap outline's "Permission Matrix" item as a read-oriented summary over T190/T194/T195/T196's underlying data (no new storage).
  - **Acceptance Criteria**: Every cell in the matrix links through to the specific editor (T190/T194/T195) that changes it.
  - **Verification**: `npx tsc --noEmit`; covered by T201
  - **Dependencies**: T190, T194, T195

- [ ] T198 [US4] `DefaultPolicyEditor` — applies-to-new-projects wiring
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/DefaultPolicyEditor.tsx` (modify, same file as T195)
  - **Goal**: Confirm a saved default-policy change is reflected the next time `useCreateDashboard`/project-creation flow runs (spec.md Acceptance Scenario US4.5) — an integration confirmation, not new storage.
  - **Acceptance Criteria**: FR-016 satisfied end-to-end.
  - **Verification**: Covered by T203
  - **Dependencies**: T196

- [ ] T199 [US4] Zero-duplicate-storage audit
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: None (documentation-only task)
  - **Goal**: Cross-check that every component built in this phase (T189–T198) reads/writes only through `permissionRepository.ts`'s composition layer (Phase 3) — no new permission-storage table was introduced anywhere in this phase's UI work.
  - **Acceptance Criteria**: Confirmed against contracts/repository-api.md's explicit "no new permission-storage of its own" rule for `permissionRepository.ts`.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T190–T198

- [ ] T200 [P] [US4] Component tests — `ProjectPermissionsView`/`DashboardPermissionsView`
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/__tests__/ProjectPermissionsView.test.tsx` (new), `src/features/admin/components/__tests__/DashboardPermissionsView.test.tsx` (new)
  - **Goal**: Test T190–T191, T194.
  - **Acceptance Criteria**: Every listed action has a passing interaction test.
  - **Verification**: `npm run test -- ProjectPermissionsView DashboardPermissionsView`
  - **Dependencies**: T191, T194

- [ ] T201 [P] [US4] Component tests — Permission Matrix
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/__tests__/PermissionMatrix.test.tsx` (new)
  - **Goal**: Test T197's combined-view rendering and drill-through links.
  - **Acceptance Criteria**: Every cell's drill-through is asserted.
  - **Verification**: `npm run test -- PermissionMatrix`
  - **Dependencies**: T197

- [ ] T202 [P] [US4] Component tests — `DefaultPolicyEditor`
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/__tests__/DefaultPolicyEditor.test.tsx` (new)
  - **Goal**: Test T195–T196.
  - **Acceptance Criteria**: Both policy categories have passing tests.
  - **Verification**: `npm run test -- DefaultPolicyEditor`
  - **Dependencies**: T195, T196

- [ ] T203 [P] [US4] Integration test — full Permission Management flow
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/__tests__/permissionManagement.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §4; asserts all of spec.md's US4 Acceptance Scenarios (1–3), plus T198's end-to-end policy application.
  - **Acceptance Criteria**: All 3 scenarios pass.
  - **Verification**: `npm run test -- permissionManagement.integration`
  - **Dependencies**: T192, T193, T198

- [ ] T204 [US4] Accessibility check — Permission Matrix
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/__tests__/PermissionMatrix.a11y.test.tsx` (new)
  - **Goal**: Keyboard-only traversal + axe scan — data tables are a common accessibility trouble spot, checked explicitly rather than assumed fine.
  - **Acceptance Criteria**: Zero critical/serious axe violations.
  - **Verification**: `npm run test -- PermissionMatrix.a11y`
  - **Dependencies**: T197

- [ ] T205 [US4] Server-side enforcement confirmation
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/app/api/admin/permissions/*` (verification, from Phase 4)
  - **Goal**: Confirm every permission-management write is independently re-checked server-side (`manage_permissions`) regardless of client-side UI state (Constitution Principle VI), the same pattern 008's T222 already established for dashboard read-only enforcement.
  - **Acceptance Criteria**: A direct API call bypassing the UI, from a user without `manage_permissions`, is still rejected.
  - **Verification**: Covered by T203
  - **Dependencies**: T072–T075

- [ ] T206 [US4] Checkpoint (Phase 10)
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US2–US4 all work independently.
  - **Acceptance Criteria**: quickstart.md §4 passes; all of T189–T205 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T189–T205

---

## Phase 11: Authentication & Sessions (Priority: P1) 🎯 Foundational — User Story 1

**Goal**: A user signs in, resets a forgotten password, stays signed in
via "remember me," and has their session managed securely, per spec.md
US1. This phase builds the actual `/api/auth/*` Route Handlers deferred
from Phase 4 (Architecture note above), since Authentication is this
feature's foundational story, not a generic CRUD resource.

**Independent Test**: Sign up/in with email and password, sign out, sign
back in — independent of any admin, role, or permission capability.

- [ ] T207 [US1] `POST /api/auth/register`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/app/api/auth/register/route.ts` (new)
  - **Goal**: Per api-contracts.md — gated by whether open registration is enabled (a `SystemSettings`/policy flag; if disabled, returns `403`).
  - **Acceptance Criteria**: Password-policy validation (FR-020) rejects a non-compliant password before any write.
  - **Verification**: `npx tsc --noEmit`; covered by T222
  - **Dependencies**: T041, T050

- [ ] T208 [US1] `POST /api/auth/login`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/app/api/auth/login/route.ts` (new)
  - **Goal**: Per api-contracts.md — `assertIpAllowed` (T051) → rate-limit (`"auth:signin"`, T011) → `verifyPassword` (T041) → `isActive` check → `createSession` (T042) → set cookie (FR-001/FR-006).
  - **Acceptance Criteria**: Identical `401` message for "no such email" and "wrong password" (FR-006).
  - **Verification**: `npx tsc --noEmit`; covered by T222
  - **Dependencies**: T041, T042, T051

- [ ] T209 [US1] `POST /api/auth/logout`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/app/api/auth/logout/route.ts` (new)
  - **Goal**: Per api-contracts.md — `deleteSession` (T042), clears cookie (FR-004).
  - **Acceptance Criteria**: The session is invalid on the very next check after this call.
  - **Verification**: `npx tsc --noEmit`; covered by T222
  - **Dependencies**: T042

- [ ] T210 [US1] `GET /api/auth/session`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/app/api/auth/session/route.ts` (new)
  - **Goal**: Per api-contracts.md — the endpoint `useSession` (T113) polls/calls on app load.
  - **Acceptance Criteria**: `401` for no/expired/invalid session.
  - **Verification**: `npx tsc --noEmit`; covered by T222
  - **Dependencies**: T042

- [ ] T211 [US1] `POST /api/auth/password-reset/request`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/app/api/auth/password-reset/request/route.ts` (new)
  - **Goal**: Per api-contracts.md — always `200`, non-disclosing (FR-006 extended); rate-limited (`"auth:password-reset"`); sends email via `nodemailer` (T017) only for a real, active account.
  - **Acceptance Criteria**: Response is identical whether or not the email is registered.
  - **Verification**: `npx tsc --noEmit`; covered by T222
  - **Dependencies**: T017, T043, T011

- [ ] T212 [US1] `POST /api/auth/password-reset/confirm`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/app/api/auth/password-reset/confirm/route.ts` (new)
  - **Goal**: Per api-contracts.md — `consumePasswordResetToken` (T043), invalidates every existing session for that user.
  - **Acceptance Criteria**: A second use of the same token, or an expired one, is rejected (spec Edge Cases).
  - **Verification**: `npx tsc --noEmit`; covered by T222
  - **Dependencies**: T043

- [ ] T213 [US1] Rewrite `getCurrentUser.ts` — real session validation
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/server/auth/getCurrentUser.ts` (modify)
  - **Goal**: Replace the interim `DEV_USER_ID` body with real session-cookie validation via `authRepository.validateSession` (T042) **and** a Bearer-token fallback path resolving an `ApiKey` (T052) to its owning `User` — the function's exported signature (`(request: Request) => Promise<User>`) is unchanged, so no other feature's code changes (plan.md's core finding #1).
  - **Acceptance Criteria**: Every existing Route Handler in the codebase (003–008) continues to work unmodified against the new implementation.
  - **Verification**: `npx tsc --noEmit`; full existing test suite still green (covered by T226's checkpoint); dedicated test in T224
  - **Dependencies**: T042, T052

- [ ] T214 [US1] `LoginForm`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/auth/components/LoginForm.tsx` (new)
  - **Goal**: Email/password/remember-me form wired to `useLogin` (T113) (spec.md Acceptance Scenario US1.1/US1.2).
  - **Acceptance Criteria**: FR-001/FR-006 satisfied at the UI layer.
  - **Verification**: `npx tsc --noEmit`; covered by T222
  - **Dependencies**: T113, T208

- [ ] T215 [US1] Logout wiring in `UserMenu`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/auth/components/UserMenu.tsx` (new)
  - **Goal**: Sign-out action wired to `useLogout` (T113), mounted in the app shell's `Navbar` (plan.md's one small existing-shell touch) (spec.md Acceptance Scenario US1.6).
  - **Acceptance Criteria**: FR-004 satisfied at the UI layer.
  - **Verification**: `npx tsc --noEmit`; covered by T222
  - **Dependencies**: T113, T209

- [ ] T216 [US1] `PasswordResetRequestForm` + `PasswordResetConfirmForm`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/auth/components/PasswordResetRequestForm.tsx` (new), `src/features/auth/components/PasswordResetConfirmForm.tsx` (new)
  - **Goal**: Wired to `useRequestPasswordReset`/`useConfirmPasswordReset` (T113) (spec.md Acceptance Scenario US1.3).
  - **Acceptance Criteria**: FR-002 satisfied at the UI layer.
  - **Verification**: `npx tsc --noEmit`; covered by T222
  - **Dependencies**: T113, T211, T212

- [ ] T217 [US1] Remember Me — persistent-session duration confirmation
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/auth/components/LoginForm.tsx` (verification, same file as T214)
  - **Goal**: Confirm the "remember me" checkbox's `isPersistent` flag correctly produces a session bounded by `SecuritySettings.rememberMeMaxDays` (T028) vs. a session ending with the browser session when unchecked (spec.md Acceptance Scenario US1.4).
  - **Acceptance Criteria**: FR-003 satisfied end-to-end (server + client).
  - **Verification**: Covered by T225
  - **Dependencies**: T028, T214

- [ ] T218 [US1] Session Timeout — inactivity expiry + re-auth prompt
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/auth/hooks/useAuth.ts` (modify, from T113)
  - **Goal**: Confirm `useSession`'s `401` response (from an expired session, T042's `lastActivityAt`-driven check) triggers `middleware.ts`'s redirect (T142) and a clear "please sign in again" state, not a silent failure (spec.md Acceptance Scenario US1.5).
  - **Acceptance Criteria**: FR-004/FR-021 satisfied end-to-end.
  - **Verification**: Covered by T225
  - **Dependencies**: T142, T218 self

- [ ] T219 [US1] Session Revocation — sign-out-of-all-devices
  - **Priority**: Should-have
  - **User Story**: US1
  - **Files**: `src/features/auth/components/UserMenu.tsx` (modify, same file as T215)
  - **Goal**: An additional action exposing `authRepository.deleteAllSessionsForUser` (T042) via a new, small endpoint/hook pairing — "sign out everywhere," a reasonable extension of FR-004's explicit sign-out requirement, distinct from the existing password-reset-triggered version (T212).
  - **Acceptance Criteria**: Every one of the user's sessions (not just the current one) is invalidated.
  - **Verification**: Covered by T225
  - **Dependencies**: T042, T215

- [ ] T220 [US1] MFA Ready — settings toggle placeholder
  - **Priority**: Should-have
  - **User Story**: US1
  - **Files**: `src/features/admin/components/UserProfileEditor.tsx` (modify, from Phase 8's T161)
  - **Goal**: A visible but clearly "coming soon"/disabled `mfaEnabled` toggle in the profile editor, reflecting data-model.md's `UserCredential.mfaEnabled` field — no working second-factor verification is wired up this phase (FR-005, spec.md's resolved Assumption).
  - **Acceptance Criteria**: The toggle is visibly distinguishable from a working feature, matching 007's precedent for "not yet available" raster-operation Toolbox entries.
  - **Verification**: Covered by T223
  - **Dependencies**: T161

- [ ] T221 [US1] Login History — confirmed reuse of `AuditLogPanel`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/admin/components/AuditLogPanel.tsx` (verification — built fully in Phase 13; this task is a forward-looking confirmation, not new implementation)
  - **Goal**: Confirm sign-in success/failure events (`SecurityAuditLog.eventType: "login_success" | "login_failure"`) are visible via the platform-wide Audit Log's category/event-type filter (US5, Phase 13) rather than a separate "Login History" screen (Architecture note).
  - **Acceptance Criteria**: No duplicate login-history UI is created.
  - **Verification**: Manual review, documented in the PR; fully verified once T249 (Phase 13) exists
  - **Dependencies**: T208

- [ ] T222 [P] [US1] Component tests — `LoginForm`/`PasswordResetRequestForm`/`PasswordResetConfirmForm`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/auth/components/__tests__/LoginForm.test.tsx` (new), `src/features/auth/components/__tests__/PasswordResetRequestForm.test.tsx` (new), `src/features/auth/components/__tests__/PasswordResetConfirmForm.test.tsx` (new)
  - **Goal**: Test T207–T216.
  - **Acceptance Criteria**: Every form's validation/submission behavior has a passing test.
  - **Verification**: `npm run test -- LoginForm PasswordResetRequestForm PasswordResetConfirmForm`
  - **Dependencies**: T214, T216

- [ ] T223 [P] [US1] Component tests — remember-me + MFA-ready toggle
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/auth/components/__tests__/LoginForm.rememberMe.test.tsx` (new), `src/features/admin/components/__tests__/UserProfileEditor.mfa.test.tsx` (new)
  - **Goal**: Test T217, T220.
  - **Acceptance Criteria**: Both have passing tests.
  - **Verification**: `npm run test -- LoginForm.rememberMe UserProfileEditor.mfa`
  - **Dependencies**: T217, T220

- [ ] T224 [P] [US1] Authentication-flow integration test
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/auth/__tests__/authFlow.integration.test.tsx` (new)
  - **Goal**: The dedicated tier from plan.md's Testing Strategy — register→login→session-validated-on-request→logout→session-invalid; password-reset request→email-sent (mocked transport)→confirm→old-password-rejected→all-sessions-invalidated.
  - **Acceptance Criteria**: Every step of both flows passes, including the mocked-email assertion.
  - **Verification**: `npm run test -- authFlow.integration`
  - **Dependencies**: T207–T213

- [ ] T225 [P] [US1] Integration test — full Authentication flow
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/auth/__tests__/authentication.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §1; asserts all of spec.md's US1 Acceptance Scenarios (1–6), including remember-me duration (T217) and inactivity timeout (T218).
  - **Acceptance Criteria**: All 6 scenarios pass.
  - **Verification**: `npm run test -- authentication.integration`
  - **Dependencies**: T217, T218, T219

- [ ] T226 [US1] Checkpoint (Phase 11)
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US4 all work independently, and that Authentication specifically requires zero changes to any pre-existing Route Handler outside this feature (plan.md's core finding #1, re-verified here).
  - **Acceptance Criteria**: quickstart.md §1 passes; all of T207–T225 complete; the full pre-existing test suite (003–008, wherever implemented) still passes unmodified against the rewritten `getCurrentUser.ts`.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T207–T225

---

## Phase 12: API Key Management (Priority: P3) — User Story 7

**Goal**: A user creates, rotates, expires, and reviews usage of scoped
API keys, per spec.md US7.

**Independent Test**: Create a read-only-scoped key, confirm an allowed
read succeeds and a disallowed write is rejected — independent of audit
logs or system settings.

- [ ] T227 [US7] `ApiKeyManagementPanel` shell + `ApiKeyList`
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/ApiKeyManagementPanel.tsx` (new), `src/features/admin/components/ApiKeyList.tsx` (new)
  - **Goal**: List wired to `useApiKeys` (T120).
  - **Acceptance Criteria**: Matches spec.md's US7 framing.
  - **Verification**: `npx tsc --noEmit`; covered by T238
  - **Dependencies**: T120

- [ ] T228 [US7] `CreateApiKeyDialog`
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/CreateApiKeyDialog.tsx` (new)
  - **Goal**: Name/scope/project/expiration form wired to `useCreateApiKey` (T120), with an explicit "copy now, you won't see this again" warning on the returned secret (spec.md Acceptance Scenario US7.1, FR-025).
  - **Acceptance Criteria**: The secret is never retrievable from the UI after this one display.
  - **Verification**: `npx tsc --noEmit`; covered by T238
  - **Dependencies**: T120, T227

- [ ] T229 [US7] `CreateApiKeyDialog` — scope selection
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/CreateApiKeyDialog.tsx` (modify, same file as T228)
  - **Goal**: Scope checklist bounded to the creating user's *own current* permission groups (FR-026) — options outside that set are not offered, not merely validated-and-rejected.
  - **Acceptance Criteria**: The UI cannot even attempt to request a scope the user doesn't have.
  - **Verification**: Covered by T238
  - **Dependencies**: T228

- [ ] T230 [US7] Rotate API Key
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/ApiKeyList.tsx` (modify, from T227)
  - **Goal**: Rotate action wired to `useRotateApiKey` (T120), same secret-shown-once UX as T228 (spec.md Acceptance Scenario US7.2, FR-027).
  - **Acceptance Criteria**: FR-027 satisfied; usage history from before rotation remains visible under the same key identity.
  - **Verification**: `npx tsc --noEmit`; covered by T239
  - **Dependencies**: T120, T227

- [ ] T231 [US7] Expire API Key — extend expiration
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/ApiKeyList.tsx` (modify, same file as T230)
  - **Goal**: Expiration date picker/extend action wired to `useUpdateApiKey` (T120) (spec.md Acceptance Scenario US7.3).
  - **Acceptance Criteria**: FR-027 satisfied for expiration management.
  - **Verification**: `npx tsc --noEmit`; covered by T239
  - **Dependencies**: T120, T227

- [ ] T232 [US7] Expired-key state display
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/ApiKeyList.tsx` (modify, same file as T230)
  - **Goal**: Uses T128's clearly-typed expired/revoked state (Phase 6) to render a distinct badge, not a generic "error" indicator.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US7.3's "a request made after expiration is rejected" — the UI visibly reflects this before the user even tries.
  - **Verification**: Covered by T239
  - **Dependencies**: T128, T231

- [ ] T233 [US7] Scopes — immutability-after-creation confirmation
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/ApiKeyList.tsx` (verification, same file as T230)
  - **Goal**: Confirm `scope` is set only at creation (T228/T229) and is not part of the update form (T231 only exposes `expiresAt`/`name`) — documented explicitly since data-model.md/repository-api.md do not define a scope-update path (rotating or recreating the key is the correct way to change scope).
  - **Acceptance Criteria**: The UI never offers a non-functional "edit scope" control.
  - **Verification**: Covered by T239
  - **Dependencies**: T231

- [ ] T234 [US7] `ApiKeyUsageView`
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/ApiKeyUsageView.tsx` (new)
  - **Goal**: Wired to `useApiKeyUsage` (T120) (spec.md Acceptance Scenario US7.5, FR-028).
  - **Acceptance Criteria**: FR-028 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T240
  - **Dependencies**: T120

- [ ] T235 [US7] Revoke API Key + confirmation
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/ApiKeyList.tsx` (modify, same file as T230)
  - **Goal**: Revoke action wired to `useRevokeApiKey` (T120), gated by an `AlertDialog` confirmation (spec.md Acceptance Scenario US7.4, FR-027).
  - **Acceptance Criteria**: FR-027 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T239
  - **Dependencies**: T120, T230

- [ ] T236 [US7] Revoked-key immediate-effect confirmation
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/ApiKeyList.tsx` (verification, same file as T230)
  - **Goal**: Confirm a revoked key's badge updates immediately (React Query cache invalidation, T120) and that a request using the revoked secret fails on its very next attempt (Phase 3's server-side enforcement, T053).
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US7.4's "stops working on the very next request."
  - **Verification**: Covered by T241
  - **Dependencies**: T053, T235

- [ ] T237 [US7] Downgraded-owner live-scope-recheck UI confirmation
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/ApiKeyList.tsx` (verification, same file as T230)
  - **Goal**: Confirm the UI does not need any special handling for this case beyond what already exists — the server (T052's live re-intersection) is the enforcement point; the UI simply reflects whatever the server currently reports as the key's effective scope, never a client-cached stale value (spec Edge Cases).
  - **Acceptance Criteria**: No client-side scope caching beyond React Query's normal, short-lived cache.
  - **Verification**: Covered by T241
  - **Dependencies**: T052

- [ ] T238 [P] [US7] Component tests — `ApiKeyList`/`CreateApiKeyDialog` incl. secret-shown-once
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/__tests__/ApiKeyList.test.tsx` (new), `src/features/admin/components/__tests__/CreateApiKeyDialog.test.tsx` (new)
  - **Goal**: Test T227–T229, explicitly asserting the secret is absent from the component's state/DOM after the initial creation display.
  - **Acceptance Criteria**: The "shown once" property is verified with an executable assertion, not a manual note.
  - **Verification**: `npm run test -- ApiKeyList CreateApiKeyDialog`
  - **Dependencies**: T228, T229

- [ ] T239 [P] [US7] Component tests — rotate/revoke/expire flows
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/__tests__/ApiKeyList.lifecycle.test.tsx` (new)
  - **Goal**: Test T230–T233, T235.
  - **Acceptance Criteria**: Every lifecycle action has a passing interaction test.
  - **Verification**: `npm run test -- ApiKeyList.lifecycle`
  - **Dependencies**: T230, T231, T233, T235

- [ ] T240 [P] [US7] Component tests — `ApiKeyUsageView`
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/__tests__/ApiKeyUsageView.test.tsx` (new)
  - **Goal**: Test T234.
  - **Acceptance Criteria**: Passing test for usage-log rendering.
  - **Verification**: `npm run test -- ApiKeyUsageView`
  - **Dependencies**: T234

- [ ] T241 [P] [US7] Integration test — full API Key Management flow
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/__tests__/apiKeyManagement.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §7; asserts all of spec.md's US7 Acceptance Scenarios (1–5), including T236's revocation-immediacy and T237's live-scope-recheck.
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- apiKeyManagement.integration`
  - **Dependencies**: T236, T237

- [ ] T242 [US7] Checkpoint (Phase 12)
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US4 and US7 all work independently.
  - **Acceptance Criteria**: quickstart.md §7 passes; all of T227–T241 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T227–T241

---

## Phase 13: Audit Logs (Priority: P2) — User Story 5

**Goal**: An administrator reviews a platform-wide, searchable log of
login history, user/project actions, and security events, and exports a
filtered slice, per spec.md US5. Per the Architecture note, "Activity
Logging"/"Security Logging"/"User Logging"/"Project Logging" are all one
merged view (`SecurityAuditLog` + 006's `Activity`), not four separate
screens.

**Independent Test**: Perform a sign-in, a role change, and a
deactivation, confirm all three appear correctly in the audit log —
independent of exporting.

- [ ] T243 [US5] `AuditLogPanel` shell
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AuditLogPanel.tsx` (new)
  - **Goal**: Container wired to `useAuditLog` (T117).
  - **Acceptance Criteria**: Matches spec.md's US5 framing.
  - **Verification**: `npx tsc --noEmit`; covered by T255
  - **Dependencies**: T117

- [ ] T244 [US5] "Activity Logging" — confirm project-scoped entries render correctly
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AuditLogTable.tsx` (new)
  - **Goal**: Confirm 006's `Activity` rows (merged by `securityAuditRepository.listAuditLog`, Phase 3) render correctly alongside `SecurityAuditLog` rows, tagged `source: "project_activity"` (spec.md Acceptance Scenario US5.2).
  - **Acceptance Criteria**: FR-018 satisfied — no duplicated entries.
  - **Verification**: `npx tsc --noEmit`; covered by T255
  - **Dependencies**: T049, T243

- [ ] T245 [US5] "Security Logging" — distinct security-event styling
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AuditLogTable.tsx` (modify, same file as T244)
  - **Goal**: Rows tagged `category: "security_event"` render with a visually distinct badge (spec.md Acceptance Scenario US5.4).
  - **Acceptance Criteria**: FR-017's "clearly categorized as a security event" satisfied.
  - **Verification**: Covered by T255
  - **Dependencies**: T244

- [ ] T246 [US5] "User Logging" — attribution confirmation
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AuditLogTable.tsx` (verification, same file as T244)
  - **Goal**: Confirm every user-management action from Phase 8 (create/deactivate/reactivate/delete/role-change) appears with correct actor/target attribution (spec.md Acceptance Scenario US5.1/US5.2).
  - **Acceptance Criteria**: FR-017 satisfied for administrative actions.
  - **Verification**: Covered by T257
  - **Dependencies**: T153, T155, T156, T244

- [ ] T247 [US5] "Project Logging" — confirmed reuse, no duplication
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: None (documentation-only task)
  - **Goal**: Confirm "Project Logging" is satisfied entirely by T244's reuse of 006's existing `Activity` feed — no second, feature-specific project-action log is introduced by this phase.
  - **Acceptance Criteria**: No duplicate project-activity storage/table exists.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T244

- [ ] T248 [US5] `AuditLogFilterBar`
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AuditLogFilterBar.tsx` (new)
  - **Goal**: Date-range + category filter controls wired to `useAuditLog`'s params (T117) (FR-019).
  - **Acceptance Criteria**: FR-019 satisfied for filtering.
  - **Verification**: `npx tsc --noEmit`; covered by T255
  - **Dependencies**: T117, T243

- [ ] T249 [US5] `AuditLogTable` — main rendering
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AuditLogTable.tsx` (modify, same file as T244)
  - **Goal**: Full row rendering (who/what/when/IP where applicable) per spec.md's US5 requirements.
  - **Acceptance Criteria**: Every field FR-017 requires is displayed.
  - **Verification**: Covered by T255
  - **Dependencies**: T244

- [ ] T250 [US5] Export Logs action
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AuditLogPanel.tsx` (modify, from T243)
  - **Goal**: Export button wired to `useExportAuditLog` (T117), using the currently active filters (spec.md Acceptance Scenario US5.5, FR-019).
  - **Acceptance Criteria**: FR-019 satisfied for export.
  - **Verification**: `npx tsc --noEmit`; covered by T256
  - **Dependencies**: T117, T248

- [ ] T251 [US5] Export Logs — download trigger confirmation
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AuditLogPanel.tsx` (verification, same file as T243)
  - **Goal**: Confirm the exported file contains exactly the filtered entries, not the full unfiltered log.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US5.5 exactly.
  - **Verification**: Covered by T256
  - **Dependencies**: T250

- [ ] T252 [US5] Filtering — date + category composition
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AuditLogFilterBar.tsx` (verification, from T248)
  - **Goal**: Confirm both filter dimensions compose correctly (AND, not OR) — a range filtered to "security events in the last 7 days" excludes both non-security events and events outside the range.
  - **Acceptance Criteria**: Composition explicitly asserted, not assumed.
  - **Verification**: Covered by T255
  - **Dependencies**: T248

- [ ] T253 [US5] Pagination — cursor-based, large-scale
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AuditLogTable.tsx` (modify, same file as T244)
  - **Goal**: Cursor pagination reusing `useAuditLog`'s existing params, matching every prior feature's list-pagination convention — never a full-table load (spec Edge Cases: "the audit log itself grows very large").
  - **Acceptance Criteria**: Responsive at a large seeded row count (verified in Phase 17's performance tier, referenced here).
  - **Verification**: Covered by T255
  - **Dependencies**: T249

- [ ] T254 [US5] Login History — closes Phase 11's forward reference
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AuditLogTable.tsx` (verification, same file as T244)
  - **Goal**: Fully resolves T221's (Phase 11) forward-looking confirmation — sign-in success/failure events are now genuinely visible and filterable here.
  - **Acceptance Criteria**: T221's deferred acceptance criteria are now fully met.
  - **Verification**: Covered by T257
  - **Dependencies**: T221, T245

- [ ] T255 [P] [US5] Component tests — `AuditLogTable`/`AuditLogFilterBar`
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/__tests__/AuditLogTable.test.tsx` (new), `src/features/admin/components/__tests__/AuditLogFilterBar.test.tsx` (new)
  - **Goal**: Test T243–T249, T252–T253.
  - **Acceptance Criteria**: Every listed behavior has a passing test.
  - **Verification**: `npm run test -- AuditLogTable AuditLogFilterBar`
  - **Dependencies**: T249, T252, T253

- [ ] T256 [P] [US5] Component tests — export action
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/__tests__/AuditLogPanel.export.test.tsx` (new)
  - **Goal**: Test T250–T251.
  - **Acceptance Criteria**: Filtered-export content correctness explicitly asserted.
  - **Verification**: `npm run test -- AuditLogPanel.export`
  - **Dependencies**: T251

- [ ] T257 [P] [US5] Integration test — full Audit Logs flow
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/__tests__/auditLogs.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §5; asserts all of spec.md's US5 Acceptance Scenarios (1–5).
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- auditLogs.integration`
  - **Dependencies**: T246, T254

- [ ] T258 [US5] Accessibility check — `AuditLogTable`
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/__tests__/AuditLogTable.a11y.test.tsx` (new)
  - **Goal**: Keyboard-only traversal + axe scan of the table/filter bar.
  - **Acceptance Criteria**: Zero critical/serious axe violations.
  - **Verification**: `npm run test -- AuditLogTable.a11y`
  - **Dependencies**: T249

- [ ] T259 [US5] Every-mutation-audited completeness audit
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: All repository files from Phase 3 (verification)
  - **Goal**: Cross-check every write function across all nine Phase 3 repository files calls `recordSecurityEvent` (T049) or already writes an `Activity` row (006) — no administrative mutation anywhere in this feature is silently unaudited (FR-017/FR-024).
  - **Acceptance Criteria**: 100% of write functions in contracts/repository-api.md accounted for.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T041–T058

- [ ] T260 [US5] Checkpoint (Phase 13)
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US5 and US7 all work independently.
  - **Acceptance Criteria**: quickstart.md §5 passes; all of T243–T259 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T243–T259

---

## Phase 14: Backup & Restore (Priority: P3) — User Story 9

**Goal**: An administrator triggers on-demand and scheduled backups,
downloads them, and restores a project from one, per spec.md US9. Per
research.md Decision 15/spec.md's Assumption, "Database Backup" means an
**application-level, project-scoped** structured export — never an
OS-level database-server backup.

**Independent Test**: Trigger an on-demand backup, download it, restore
a test project from it — independent of scheduling.

- [ ] T261 [US9] `BackupRestorePanel` shell + `BackupHistoryList`
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/BackupRestorePanel.tsx` (new), `src/features/admin/components/BackupHistoryList.tsx` (new)
  - **Goal**: List wired to `useBackups` (T122).
  - **Acceptance Criteria**: Matches spec.md's US9 framing.
  - **Verification**: `npx tsc --noEmit`; covered by T273
  - **Dependencies**: T122

- [ ] T262 [US9] "Database Backup" scope confirmation
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: None (documentation-only task)
  - **Goal**: Confirm this feature's `Backup` entity is project-scoped, application-level (research.md Decision 15) — no OS-level `pg_dump`/infrastructure feature exists or is implied by this UI, documented explicitly since "Database Backup" in the roadmap outline could otherwise be misread.
  - **Acceptance Criteria**: No infrastructure-level backup tooling is built.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: None

- [ ] T263 [US9] `TriggerBackupButton`
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/TriggerBackupButton.tsx` (new)
  - **Goal**: Wired to `useTriggerBackup` (T122) (spec.md Acceptance Scenario US9.1, FR-033).
  - **Acceptance Criteria**: FR-033 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T273
  - **Dependencies**: T122, T261

- [ ] T264 [US9] `TriggerBackupButton` — in-progress state
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/TriggerBackupButton.tsx` (modify, same file as T263)
  - **Goal**: Shows a pending/in-progress indicator while the server assembles the backup (T107's `retry: false`, T086 in Phase 6's mutation-state convention) rather than appearing unresponsive.
  - **Acceptance Criteria**: A large-project backup's assembly time (Performance section) doesn't read as a frozen UI.
  - **Verification**: Covered by T273
  - **Dependencies**: T263

- [ ] T265 [US9] `RestoreConfirmDialog`
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/RestoreConfirmDialog.tsx` (new)
  - **Goal**: Wired to `useRestoreBackup` (T122) (spec.md Acceptance Scenario US9.4, FR-036).
  - **Acceptance Criteria**: FR-036 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T274
  - **Dependencies**: T122, T261

- [ ] T266 [US9] `RestoreConfirmDialog` — overwrite-warning flow
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/RestoreConfirmDialog.tsx` (modify, same file as T265)
  - **Goal**: Presents the "this will overwrite current data" warning (with the target's current-modification timestamp, api-contracts.md's `409` response shape) and requires explicit confirmation before proceeding (spec Edge Cases).
  - **Acceptance Criteria**: The warning is unmissable — not a subtle checkbox easily overlooked.
  - **Verification**: Covered by T274
  - **Dependencies**: T265

- [ ] T267 [US9] `RestoreConfirmDialog` — failed-restore state
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/RestoreConfirmDialog.tsx` (modify, same file as T265)
  - **Goal**: A clear failure message when a restore fails, explicitly confirming (in the message copy) that the target project's data is unchanged (FR-037), so the administrator isn't left wondering about the project's current state.
  - **Acceptance Criteria**: Matches spec.md's Edge Case exactly.
  - **Verification**: Covered by T274
  - **Dependencies**: T057, T265

- [ ] T268 [US9] Export Backup — download action
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/BackupHistoryList.tsx` (modify, from T261)
  - **Goal**: Download button wired to `useDownloadBackup` (T122) (spec.md Acceptance Scenario US9.3, FR-035).
  - **Acceptance Criteria**: FR-035 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T273
  - **Dependencies**: T122, T261

- [ ] T269 [US9] Backup Scheduling — current-schedule display
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/BackupRestorePanel.tsx` (modify, from T261)
  - **Goal**: Shows the currently configured backup schedule (read from `SystemSettings`, actual configuration UI built in Phase 16's `BackupSettingsForm`) and next-run time (spec.md Acceptance Scenario US9.2).
  - **Acceptance Criteria**: FR-034 satisfied for visibility; configuration itself is a Phase 16 cross-reference, not duplicated here.
  - **Verification**: Covered by T273
  - **Dependencies**: T261

- [ ] T270 [US9] Backup Scheduling — manual run-due trigger (ops convenience)
  - **Priority**: Should-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/BackupRestorePanel.tsx` (modify, same file as T269)
  - **Goal**: An Admin-only manual "run due backups now" action for testing/operational convenience, calling the same `run-due` endpoint (T088) a real scheduler would call — clearly labeled as a testing/ops aid, not the primary trigger path.
  - **Acceptance Criteria**: Uses the identical endpoint a production scheduler uses — no second code path.
  - **Verification**: Covered by T275
  - **Dependencies**: T088, T269

- [ ] T271 [US9] `BackupHistoryList` — pagination + status badges
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/BackupHistoryList.tsx` (modify, same file as T261)
  - **Goal**: Cursor pagination + `succeeded`/`failed` status badges per row.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US9.1/US9.2's "backup history."
  - **Verification**: Covered by T273
  - **Dependencies**: T261

- [ ] T272 [US9] `BackupHistoryList` — failed-backup error display
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/BackupHistoryList.tsx` (modify, same file as T261)
  - **Goal**: A failed row shows `errorMessage` clearly and offers no broken download link (mirroring 008's `Report` failure-display precedent).
  - **Acceptance Criteria**: FR requirement implied by spec's failure-handling philosophy satisfied.
  - **Verification**: Covered by T273
  - **Dependencies**: T271

- [ ] T273 [P] [US9] Component tests — `BackupHistoryList`/`TriggerBackupButton`
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/__tests__/BackupHistoryList.test.tsx` (new), `src/features/admin/components/__tests__/TriggerBackupButton.test.tsx` (new)
  - **Goal**: Test T261–T264, T268–T272.
  - **Acceptance Criteria**: Every listed behavior has a passing test.
  - **Verification**: `npm run test -- BackupHistoryList TriggerBackupButton`
  - **Dependencies**: T264, T268, T271, T272

- [ ] T274 [P] [US9] Component tests — `RestoreConfirmDialog` incl. overwrite-warning flow
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/__tests__/RestoreConfirmDialog.test.tsx` (new)
  - **Goal**: Test T265–T267.
  - **Acceptance Criteria**: The overwrite-warning and failure-state messages are explicitly asserted.
  - **Verification**: `npm run test -- RestoreConfirmDialog`
  - **Dependencies**: T266, T267

- [ ] T275 [P] [US9] Integration test — full Backup & Restore flow
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/__tests__/backupRestore.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §9; asserts all of spec.md's US9 Acceptance Scenarios (1–5).
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- backupRestore.integration`
  - **Dependencies**: T270

- [ ] T276 [P] [US9] Data-integrity test — failed restore leaves project unchanged
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/__tests__/backupRestore.integrity.test.tsx` (new)
  - **Goal**: Component/integration-level extension of T061's repository-level test — a deliberately corrupted backup file, restored through the full UI flow, must leave the target project provably unchanged.
  - **Acceptance Criteria**: FR-037 verified end-to-end, not just at the repository layer.
  - **Verification**: `npm run test:db -- backupRestore.integrity`
  - **Dependencies**: T061, T267

- [ ] T277 [US9] Accessibility check — `RestoreConfirmDialog`
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/__tests__/RestoreConfirmDialog.a11y.test.tsx` (new)
  - **Goal**: Keyboard-only traversal + axe scan — a high-stakes, destructive-action confirmation dialog deserves specific accessibility attention, not just default coverage.
  - **Acceptance Criteria**: Zero critical/serious axe violations.
  - **Verification**: `npm run test -- RestoreConfirmDialog.a11y`
  - **Dependencies**: T266

- [ ] T278 [US9] Checkpoint (Phase 14)
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US5, US7, and US9 all work independently.
  - **Acceptance Criteria**: quickstart.md §9 passes; all of T261–T277 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T261–T277

---

## Phase 15: Monitoring (Priority: P3) — User Story 10

**Goal**: An administrator views a platform health dashboard summarizing
storage, user, API, and performance statistics, per spec.md US10. Per
the Architecture note, "Database Statistics"/"Error Statistics" are
folded into the storage/performance signals `monitoringRepository`
already computes — no separate raw-DB-internals or error-only view
exists.

**Independent Test**: Open the health dashboard, confirm displayed user/
storage counts match actual current state — independent of any other
administrative action.

- [ ] T279 [US10] `MonitoringDashboard` shell + `HealthSummaryCards`
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/MonitoringDashboard.tsx` (new), `src/features/admin/components/HealthSummaryCards.tsx` (new)
  - **Goal**: Cards wired to `useMonitoringOverview` (T123) (spec.md Acceptance Scenario US10.1, FR-038).
  - **Acceptance Criteria**: FR-038 satisfied for the summary view.
  - **Verification**: `npx tsc --noEmit`; covered by T290
  - **Dependencies**: T123

- [ ] T280 [US10] `HealthSummaryCards` — overall status
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/HealthSummaryCards.tsx` (modify, same file as T279)
  - **Goal**: Storage usage, active/total user counts, one performance indicator, matching the exact fields FR-038 lists.
  - **Acceptance Criteria**: Displayed values match actual current state (verified in T293's integration test).
  - **Verification**: Covered by T290
  - **Dependencies**: T279

- [ ] T281 [US10] `StorageUsageChart`
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/StorageUsageChart.tsx` (new)
  - **Goal**: Reuses 008's `ChartWidgetBase`/Recharts integration (plan.md's Architecture note — no second charting setup), showing storage usage against the configured cap (T307 in Phase 16 sets the cap).
  - **Acceptance Criteria**: FR-039's threshold-flagging visual (T287) applies to this chart.
  - **Verification**: `npx tsc --noEmit`; covered by T290
  - **Dependencies**: T123

- [ ] T282 [US10] "Database Statistics" — confirmed folded into storage/system stats
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: None (documentation-only task)
  - **Goal**: Confirm this platform exposes no raw database-internals metrics beyond what `monitoringRepository.getMonitoringOverview` already aggregates (dashboard/widget/project counts, storage) — no separate "Database Statistics" view is built, since this codebase has no lower-level DB metrics surface to draw from (research.md Decision 17's explicit "no APM/observability vendor integration" scope boundary).
  - **Acceptance Criteria**: No `DatabaseStatisticsView` component is created.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: None

- [ ] T283 [US10] `ApiStatisticsChart`
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/ApiStatisticsChart.tsx` (new)
  - **Goal**: Wired to `useMonitoringOverview`'s `api` field (T123) (spec.md Acceptance Scenario US10.2, FR-038).
  - **Acceptance Criteria**: FR-038 satisfied for API statistics.
  - **Verification**: `npx tsc --noEmit`; covered by T291
  - **Dependencies**: T123

- [ ] T284 [US10] `UserStatisticsChart`
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/UserStatisticsChart.tsx` (new)
  - **Goal**: Sign-in activity trend over a recent window (spec.md Acceptance Scenario US10.3, FR-038).
  - **Acceptance Criteria**: FR-038 satisfied for user statistics.
  - **Verification**: `npx tsc --noEmit`; covered by T291
  - **Dependencies**: T123

- [ ] T285 [US10] Performance indicator
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/HealthSummaryCards.tsx` (modify, same file as T279)
  - **Goal**: Derived from `SecurityAuditLog` failure-rate signals (research.md Decision 17), displayed as a simple trend/indicator, not a full APM chart.
  - **Acceptance Criteria**: FR-038's "basic system-performance indicator" satisfied — proportionate scope, not a dedicated observability product.
  - **Verification**: Covered by T290
  - **Dependencies**: T062, T279

- [ ] T286 [US10] "Error Statistics" — confirmed folded into performance indicator
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: None (documentation-only task)
  - **Goal**: Confirm error-rate data is part of T285's derived performance signal, not a second, separate "Error Statistics" view.
  - **Acceptance Criteria**: No `ErrorStatisticsView` component is created.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T285

- [ ] T287 [US10] Threshold flagging
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/HealthSummaryCards.tsx`, `StorageUsageChart.tsx` (both modify)
  - **Goal**: Visual flag (e.g., a warning color/icon) on any metric whose value is over its configured threshold (`SystemSettings.storageLimitBytesPerProject`, etc.) — `flags` array from `useMonitoringOverview` (T123) drives this directly (spec.md Acceptance Scenario US10.4, FR-039).
  - **Acceptance Criteria**: FR-039 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T292
  - **Dependencies**: T123, T280, T281

- [ ] T288 [US10] `/api/health` unauthenticated confirmation
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/app/api/health/route.ts` (verification, from T089)
  - **Goal**: Confirm this endpoint (distinct from the authenticated `MonitoringDashboard`) works with zero session/API key present, matching standard platform health-check conventions documented in plan.md's Deployment Notes.
  - **Acceptance Criteria**: A request with no cookie/Authorization header still succeeds.
  - **Verification**: Covered by T293
  - **Dependencies**: T089

- [ ] T289 [US10] Live-refresh polling confirmation
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/MonitoringDashboard.tsx` (verification, from T279)
  - **Goal**: Confirm `useMonitoringOverview`'s `refetchInterval` (T123) keeps the dashboard's displayed values fresh without a manual reload, supporting SC-008's "assessable in under 30 seconds" via always-current data.
  - **Acceptance Criteria**: SC-008 satisfied.
  - **Verification**: Covered by T293
  - **Dependencies**: T123, T279

- [ ] T290 [P] [US10] Component tests — `HealthSummaryCards`/`StorageUsageChart`
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/__tests__/HealthSummaryCards.test.tsx` (new), `src/features/admin/components/__tests__/StorageUsageChart.test.tsx` (new)
  - **Goal**: Test T279–T281, T285.
  - **Acceptance Criteria**: Every listed behavior has a passing test.
  - **Verification**: `npm run test -- HealthSummaryCards StorageUsageChart`
  - **Dependencies**: T280, T281, T285

- [ ] T291 [P] [US10] Component tests — `ApiStatisticsChart`/`UserStatisticsChart`
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/__tests__/ApiStatisticsChart.test.tsx` (new), `src/features/admin/components/__tests__/UserStatisticsChart.test.tsx` (new)
  - **Goal**: Test T283–T284.
  - **Acceptance Criteria**: Both have passing tests.
  - **Verification**: `npm run test -- ApiStatisticsChart UserStatisticsChart`
  - **Dependencies**: T283, T284

- [ ] T292 [P] [US10] Component tests — threshold flagging
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/__tests__/HealthSummaryCards.thresholds.test.tsx` (new)
  - **Goal**: Test T287.
  - **Acceptance Criteria**: A metric over threshold renders the flag; one under threshold does not.
  - **Verification**: `npm run test -- HealthSummaryCards.thresholds`
  - **Dependencies**: T287

- [ ] T293 [P] [US10] Integration test — full Monitoring flow
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/__tests__/monitoring.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §10; asserts all of spec.md's US10 Acceptance Scenarios (1–4).
  - **Acceptance Criteria**: All 4 scenarios pass.
  - **Verification**: `npm run test -- monitoring.integration`
  - **Dependencies**: T288, T289

- [ ] T294 [US10] Accessibility check — `MonitoringDashboard` charts
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/__tests__/MonitoringDashboard.a11y.test.tsx` (new)
  - **Goal**: Every chart's accessible data-table fallback (reusing 008's chart-accessibility precedent) verified present and keyboard-reachable.
  - **Acceptance Criteria**: Zero critical/serious axe violations.
  - **Verification**: `npm run test -- MonitoringDashboard.a11y`
  - **Dependencies**: T281, T283, T284

- [ ] T295 [US10] Performance check — dashboard load time
  - **Priority**: Should-have
  - **User Story**: US10
  - **Files**: `src/features/admin/__tests__/monitoring.integration.test.tsx` (verify, same file as T293)
  - **Goal**: Confirm the dashboard's initial load, from open to fully-rendered data, supports SC-008's "under 30 seconds" assessment target with real margin, not just barely.
  - **Acceptance Criteria**: SC-008 satisfied with measured timing, documented in the PR.
  - **Verification**: Manual timing check, documented in the PR
  - **Dependencies**: T289

- [ ] T296 [US10] Checkpoint (Phase 15)
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US5, US7, US9, and US10 all work independently.
  - **Acceptance Criteria**: quickstart.md §10 passes; all of T279–T295 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T279–T295

---

## Phase 16: UI Components (Priority: P1/P2) — User Story 1 integration + User Story 6 (Security Settings) + User Story 8 (System Settings)

**Goal**: Final integration of every panel built in Phases 8–15 into one
cohesive `AdminShell`, plus Security Settings (US6) and System Settings
(US8) — the two stories the roadmap outline's Phases 8–15 gave no
dedicated phase to, matching 007/008's precedent of folding an
otherwise-homeless story into "UI Components" (there, US7/US10; US6/US8
here) since this phase's named items ("Security Center," "Settings
Page") are exactly where they belong.

**Independent Test**: Open the fully-integrated admin area, confirm
every panel is reachable and functions together; configure security and
system settings and confirm they take effect.

- [ ] T297 [US1] `AdminShell` — final integration
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/admin/components/AdminShell.tsx` (new)
  - **Goal**: Top-level admin layout with section navigation wired to `adminStore.activeSection` (T136/T145) and its permission-aware visibility hint.
  - **Acceptance Criteria**: Every section from T145's derived selector is reachable when granted, hidden when not.
  - **Verification**: `npx tsc --noEmit`; covered by T319
  - **Dependencies**: T136, T145

- [ ] T298 [US1] Admin Dashboard — landing/overview page
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/admin/components/AdminShell.tsx` (modify, same file as T297)
  - **Goal**: A landing view linking into every section, with a small quick-stats summary reusing `useMonitoringOverview` (T123) — not a duplicate of `MonitoringDashboard` itself, a lighter-weight entry point.
  - **Acceptance Criteria**: Every administrative area is reachable within one click from this landing view.
  - **Verification**: Covered by T319
  - **Dependencies**: T123, T297

- [ ] T299 [US1] User Management Page — final integration
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/admin/components/AdminShell.tsx` (modify, same file as T297)
  - **Goal**: Mounts `UserManagementPanel` (Phase 8) as a section.
  - **Acceptance Criteria**: Fully functional within the integrated shell, no regression from Phase 8's standalone tests.
  - **Verification**: Covered by T322
  - **Dependencies**: T149, T297

- [ ] T300 [US3] Role Management Page — final integration
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/admin/components/AdminShell.tsx` (modify, same file as T297)
  - **Goal**: Mounts `RoleManagementPanel` (Phase 9) as a section.
  - **Acceptance Criteria**: Fully functional within the integrated shell.
  - **Verification**: Covered by T322
  - **Dependencies**: T171, T297

- [ ] T301 [US4] Permission Matrix page — final integration
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/admin/components/AdminShell.tsx` (modify, same file as T297)
  - **Goal**: Mounts `PermissionManagementPanel` (Phase 10) as a section.
  - **Acceptance Criteria**: Fully functional within the integrated shell.
  - **Verification**: Covered by T322
  - **Dependencies**: T189, T297

- [ ] T302 [US7] API Key Manager — final integration
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/admin/components/AdminShell.tsx` (modify, same file as T297)
  - **Goal**: Mounts `ApiKeyManagementPanel` (Phase 12) as an admin section, **and** confirms the self-service entry point (any signed-in user managing their own keys, api-contracts.md's self-service scope) remains reachable outside `AdminShell` too, e.g. from `UserProfileEditor`.
  - **Acceptance Criteria**: Both entry points (admin oversight + self-service) work correctly and consistently.
  - **Verification**: Covered by T322
  - **Dependencies**: T161, T227, T297

- [ ] T303 [US5] Audit Viewer — final integration
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/admin/components/AdminShell.tsx` (modify, same file as T297)
  - **Goal**: Mounts `AuditLogPanel` (Phase 13) as a section.
  - **Acceptance Criteria**: Fully functional within the integrated shell.
  - **Verification**: Covered by T322
  - **Dependencies**: T243, T297

- [ ] T304 [US6] `SecuritySettingsPanel` — build
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/admin/components/SecuritySettingsPanel.tsx` (new)
  - **Goal**: Password-policy/session-timeout/rate-limit forms wired to `useSecuritySettings`/`useUpdateSecuritySettings` (T119) (spec.md Acceptance Scenarios US6.1–3, FR-020–022) — the roadmap outline's "Security Center."
  - **Acceptance Criteria**: FR-020–022 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T318
  - **Dependencies**: T119

- [ ] T305 [US6] `SecuritySettingsPanel` — IP allow/deny list editor
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/admin/components/SecuritySettingsPanel.tsx` (modify, same file as T304)
  - **Goal**: IP/CIDR list editor (spec.md Acceptance Scenario US6.4, FR-023), with an in-UI warning about the break-glass recovery path (plan.md's Security section) before an administrator saves a restrictive change.
  - **Acceptance Criteria**: FR-023 satisfied; the warning is shown before the potentially-self-locking-out save, not after.
  - **Verification**: Covered by T318
  - **Dependencies**: T304

- [ ] T306 [US6] `SecuritySettingsPanel` — final integration
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/admin/components/AdminShell.tsx` (modify, from T297)
  - **Goal**: Mounts `SecuritySettingsPanel` as a section (spec.md Acceptance Scenario US6.5's audit-log confirmation already wired via T050's transactional write).
  - **Acceptance Criteria**: Every security-setting change is confirmed visible in the Audit Log (Phase 13) after saving.
  - **Verification**: Covered by T320
  - **Dependencies**: T260, T305

- [ ] T307 [US8] `SystemSettingsPanel` — general + storage forms
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/admin/components/SystemSettingsPanel.tsx` (new), `src/features/admin/components/GeneralSettingsForm.tsx` (new), `src/features/admin/components/StorageSettingsForm.tsx` (new)
  - **Goal**: Wired to `useSystemSettings`/`useUpdateSystemSettings` (T121) (spec.md Acceptance Scenarios US8.1–2, FR-029/030).
  - **Acceptance Criteria**: A configured storage limit is reflected in `StorageUsageChart` (Phase 15) and enforced (T030's storage-blocking behavior).
  - **Verification**: `npx tsc --noEmit`; covered by T318
  - **Dependencies**: T121

- [ ] T308 [US8] `SystemSettingsPanel` — map defaults form
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/admin/components/MapDefaultsForm.tsx` (new)
  - **Goal**: Center/zoom/basemap form wired to `useUpdateSystemSettings` (spec.md Acceptance Scenario US8.3, FR-031).
  - **Acceptance Criteria**: A newly created project uses the configured defaults (verified in T321's integration test).
  - **Verification**: `npx tsc --noEmit`; covered by T318
  - **Dependencies**: T121, T307

- [ ] T309 [US8] `SystemSettingsPanel` — email settings form
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/admin/components/EmailSettingsForm.tsx` (new)
  - **Goal**: SMTP configuration form + "Send test email" action wired to `useSendTestEmail` (T121) (spec.md Acceptance Scenario US8.4, FR-032) — closes the cross-reference from T211/T212 (Phase 11), which depend on this configuration existing.
  - **Acceptance Criteria**: FR-032 satisfied; a successful test email confirms password-reset emails will also work.
  - **Verification**: `npx tsc --noEmit`; covered by T318
  - **Dependencies**: T121, T307

- [ ] T310 [US8] `SystemSettingsPanel` — backup settings form
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/admin/components/BackupSettingsForm.tsx` (new)
  - **Goal**: Schedule/retention form wired to `useUpdateSystemSettings` (spec.md Acceptance Scenario US8.5) — closes the cross-reference from T269 (Phase 14), which displays what this form configures.
  - **Acceptance Criteria**: A saved schedule is reflected in T269's "current schedule" display.
  - **Verification**: `npx tsc --noEmit`; covered by T318
  - **Dependencies**: T121, T269, T307

- [ ] T311 [US8] `SystemSettingsPanel` — final integration
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/admin/components/AdminShell.tsx` (modify, from T297)
  - **Goal**: Mounts `SystemSettingsPanel` (with all four sub-forms) as a section — the roadmap outline's "Settings Page."
  - **Acceptance Criteria**: All four sub-forms function together within one panel.
  - **Verification**: Covered by T321
  - **Dependencies**: T308, T309, T310

- [ ] T312 [US9] Backup Manager — final integration
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/admin/components/AdminShell.tsx` (modify, from T297)
  - **Goal**: Mounts `BackupRestorePanel` (Phase 14) as a section.
  - **Acceptance Criteria**: Fully functional within the integrated shell.
  - **Verification**: Covered by T322
  - **Dependencies**: T261, T297

- [ ] T313 [US10] Monitoring Dashboard — final integration
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/admin/components/AdminShell.tsx` (modify, from T297)
  - **Goal**: Mounts `MonitoringDashboard` (Phase 15) as a section.
  - **Acceptance Criteria**: Fully functional within the integrated shell.
  - **Verification**: Covered by T322
  - **Dependencies**: T279, T297

- [ ] T314 [US1] Dialogs audit — focus-trap/restore consistency
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: Every `Dialog`/`AlertDialog`-based component across `src/features/admin/components/` and `src/features/auth/components/`
  - **Goal**: Confirm every dialog across the fully-integrated module traps and restores focus correctly, consistent with 007/008's established `ProgressDialog`/preset-dialog precedent.
  - **Acceptance Criteria**: Tab never escapes an open dialog; closing returns focus predictably.
  - **Verification**: Covered by T324
  - **Dependencies**: T297–T313

- [ ] T315 [US1] Loading states audit
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: Every list/detail-shaped component across both modules
  - **Goal**: Skeleton/spinner states for every panel while its query is pending — no blank flash anywhere in either module.
  - **Acceptance Criteria**: Matches Constitution's Additional Standards.
  - **Verification**: Covered by T319
  - **Dependencies**: T297–T313

- [ ] T316 [US1] Error states — top-level boundary + `lastError` banners
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/admin/components/AdminShell.tsx` (modify, from T297), `src/features/auth/components/LoginForm.tsx` (modify, from T214)
  - **Goal**: A React error boundary wrapping `AdminShell` (Constitution's "every top-level feature mounted in the dashboard shell" rule), plus `authStore.lastAuthError`/an equivalent admin-side error surface for non-panel-specific failures.
  - **Acceptance Criteria**: A failure outside any single panel shows a recoverable error state, not a blank page.
  - **Verification**: Covered by T319
  - **Dependencies**: T133, T297

- [ ] T317 [US1] Empty states audit
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `UserList.tsx`, `RoleList.tsx`, `ApiKeyList.tsx`, `AuditLogTable.tsx`, `BackupHistoryList.tsx` (all verify)
  - **Goal**: Confirm every list-shaped panel has a distinct, non-generic empty state (e.g., "no API keys yet — create your first one").
  - **Acceptance Criteria**: 1:1 audit against every list component across both modules.
  - **Verification**: Covered by T319
  - **Dependencies**: T149, T171, T227, T243, T261

- [ ] T318 [P] [US6] Component tests — `SecuritySettingsPanel`/`SystemSettingsPanel`
  - **Priority**: Must-have
  - **User Story**: US6 (also covers US8's `SystemSettingsPanel` tests — the two forms are tested together in one task since both were built in this same phase)
  - **Files**: `src/features/admin/components/__tests__/SecuritySettingsPanel.test.tsx` (new), `src/features/admin/components/__tests__/SystemSettingsPanel.test.tsx` (new)
  - **Goal**: Test T304–T305, T307–T310.
  - **Acceptance Criteria**: Every form's validation/submission behavior has a passing test.
  - **Verification**: `npm run test -- SecuritySettingsPanel SystemSettingsPanel`
  - **Dependencies**: T305, T309, T310

- [ ] T319 [P] [US1] Component tests — `AdminShell` navigation + loading/error/empty states
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/admin/components/__tests__/AdminShell.test.tsx` (new), `src/features/admin/components/__tests__/AdminShell.states.test.tsx` (new)
  - **Goal**: Test T297–T298, T315–T317.
  - **Acceptance Criteria**: Every section's navigation entry and every state (loading/error/empty) has a passing test.
  - **Verification**: `npm run test -- AdminShell AdminShell.states`
  - **Dependencies**: T298, T315, T316, T317

- [ ] T320 [P] [US6] Integration test — full Security Settings flow
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/admin/__tests__/securitySettings.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §6; asserts all of spec.md's US6 Acceptance Scenarios (1–5).
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- securitySettings.integration`
  - **Dependencies**: T306

- [ ] T321 [P] [US8] Integration test — full System Settings flow
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/admin/__tests__/systemSettings.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §8; asserts all of spec.md's US8 Acceptance Scenarios (1–5).
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- systemSettings.integration`
  - **Dependencies**: T311

- [ ] T322 [P] [US1] Integration test — full admin-module navigation/integration flow
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/admin/__tests__/adminIntegration.test.tsx` (new)
  - **Goal**: A single session touching every section (users, roles, permissions, API keys, audit, security, system settings, backups, monitoring) mounted together, confirming no conflict between them.
  - **Acceptance Criteria**: All of T299–T313 function together without regression.
  - **Verification**: `npm run test -- adminIntegration`
  - **Dependencies**: T299–T313

- [ ] T323 [US1] Keyboard navigation audit — fully-integrated `AdminShell`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/admin/components/AdminShell.tsx` (verification, from T297)
  - **Goal**: Full Tab/Enter/Escape traversal across every section/dialog/panel now mounted together (FR/SC-008-equivalent for this feature).
  - **Acceptance Criteria**: Every action reachable via keyboard alone, including cross-section navigation.
  - **Verification**: Manual keyboard-only pass, documented in the PR; automated in T324
  - **Dependencies**: T299–T313

- [ ] T324 [P] [US1] Full-page accessibility test
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/admin/components/__tests__/AdminShell.a11y.test.tsx` (new)
  - **Goal**: Automated axe scan of `AdminShell` with every section opened at least once during the test.
  - **Acceptance Criteria**: Zero critical/serious axe violations across the full integrated view.
  - **Verification**: `npm run test -- AdminShell.a11y`
  - **Dependencies**: T314, T323

- [ ] T325 [US1] Checkpoint (Phase 16)
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: None (verification-only task)
  - **Goal**: Confirm every user story (US1–US10) now works both independently and as one integrated administrative experience.
  - **Acceptance Criteria**: quickstart.md §6 and §8 pass; all of T297–T324 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T297–T324

---

## Phase 17: Performance

**Purpose**: Verify and tune against spec.md's Performance-adjacent
Success Criteria (SC-005 user search at 10,000+ scale; audit-log/backup
scale) now that every capability exists end-to-end.

- [ ] T326 Caching — `monitoringRepository` compute-if-stale confirmation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/monitoringRepository.ts` (verification, from T062)
  - **Goal**: Confirm the platform-wide extension of 008's `dashboardAnalyticsRepository` compute-if-stale pattern (research.md Decision 17) actually shares one recomputation across concurrent monitoring-dashboard viewers within its TTL window.
  - **Acceptance Criteria**: A second request within the TTL returns a cached result without recomputing.
  - **Verification**: Covered by T339
  - **Dependencies**: T062

- [ ] T327 [P] Caching — React Query stale/gc time review
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/admin/services/queryKeys.ts` (modify, from T106, if per-query overrides are needed)
  - **Goal**: Tune `staleTime` per entity — rarely-changing data (roles, permission groups, system settings) gets a long `staleTime`; frequently-changing data (audit log, monitoring, sessions) stays short/polling — avoiding both stale-data bugs and redundant refetches.
  - **Acceptance Criteria**: No unnecessary duplicate network request observed in React Query Devtools for rarely-changing entities.
  - **Verification**: Manual React Query Devtools review
  - **Dependencies**: T106

- [ ] T328 [P] Database optimization — user search index tuning
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, if a `pg_trgm` index proves necessary — plan.md's flagged tuning decision, resolved here with real data)
  - **Goal**: Measure `listUsers`'s search query against a seeded 10,000+-row dataset; add a trigram index if a plain `ILIKE` scan doesn't meet SC-005's 5-second target.
  - **Acceptance Criteria**: SC-005 satisfied with measured timing, not assumed.
  - **Verification**: `npx prisma validate` (if schema changed); documented timing in the PR
  - **Dependencies**: T044

- [ ] T329 [P] Database optimization — audit log query plan verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (`EXPLAIN ANALYZE` run against the test database)
  - **Goal**: Verify `securityAuditRepository.listAuditLog`'s indexes (`createdAt`, `[category, createdAt]`) are actually used at a large seeded row count, with no sequential scan.
  - **Acceptance Criteria**: Clean query plan documented in the PR.
  - **Verification**: Manual `EXPLAIN ANALYZE` review, documented in the PR
  - **Dependencies**: T049

- [ ] T330 Database optimization — `Session.lastActivityAt` write-throttling
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/authRepository.ts` (modify, from T042)
  - **Goal**: Implement plan.md's Performance section's throttling rule — update `lastActivityAt` at most once per a short interval (e.g., once per minute of actual activity), not on literally every request, to avoid doubling write load platform-wide.
  - **Acceptance Criteria**: A rapid sequence of requests from one session results in a bounded number of `lastActivityAt` writes, not one per request.
  - **Verification**: `npx tsc --noEmit`; covered by T339
  - **Dependencies**: T042

- [ ] T331 [P] Lazy loading — admin module's heavy components
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/components/StorageUsageChart.tsx`, `ApiStatisticsChart.tsx`, `UserStatisticsChart.tsx` (all modify)
  - **Goal**: Dynamic-import (`next/dynamic`, `ssr: false` where DOM-dependent) every Recharts-based component, matching Constitution Principle V and 008's established convention — no new charting setup, but still subject to the same lazy-loading discipline.
  - **Acceptance Criteria**: None of these components appear in the initial route bundle's analysis output.
  - **Verification**: Covered by T336
  - **Dependencies**: T281, T283, T284

- [ ] T332 [P] Lazy loading — `auth` module footprint confirmation
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/auth/components/*.tsx` (verify)
  - **Goal**: Confirm the `auth` module's components (login/reset forms) are intentionally **not** lazy-loaded — they're small, framework-only forms needed on first paint for an unauthenticated visitor, unlike the admin module's heavier, rarely-first-loaded charts.
  - **Acceptance Criteria**: Documented rationale for the different treatment between the two modules.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T214, T216

- [ ] T333 [P] Memoization — chart data transforms
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `StorageUsageChart.tsx`, `ApiStatisticsChart.tsx`, `UserStatisticsChart.tsx` (all modify)
  - **Goal**: Memoize the raw-data-to-Recharts-series transform per chart so it doesn't recompute on every unrelated re-render, matching 008's established chart-memoization convention.
  - **Acceptance Criteria**: No dropped frames during rapid dashboard interaction in a manual profiling pass.
  - **Verification**: Manual React DevTools Profiler review
  - **Dependencies**: T331

- [ ] T334 [P] Memoization — Zustand selector narrowness final audit
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: All `adminStore`/`authStore` consumers across both modules
  - **Goal**: Extend T140's audit now that every consumer exists — confirm no component subscribes to more store state than it renders.
  - **Acceptance Criteria**: Verified via React DevTools Profiler across the fully-built modules.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T140, T325

- [ ] T335 Pagination — final cross-module audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `UserList.tsx`, `RoleList.tsx`, `ApiKeyList.tsx`, `AuditLogTable.tsx`, `BackupHistoryList.tsx` (all verify)
  - **Goal**: Confirm every list view across the module uses cursor pagination consistently, never a full-table client-side load, matching every prior feature's established convention.
  - **Acceptance Criteria**: 100% of list views audited.
  - **Verification**: Manual review, documented in the PR
  - **Dependencies**: T163, T253, T271

- [ ] T336 Bundle optimization — bundle-analyzer run
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (`@next/bundle-analyzer` run)
  - **Goal**: Confirm `nodemailer` (T017) contributes zero bytes to any client bundle (server-only usage), and that T331's dynamic imports are correctly excluded from the initial route bundle, per Constitution Principle V.
  - **Acceptance Criteria**: Both confirmations documented in the PR.
  - **Verification**: `ANALYZE=true npm run build` (or the project's existing bundle-analyzer command)
  - **Dependencies**: T017, T331

- [ ] T337 [P] Performance tests — user search at scale
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/userManagementRepository.performance.test.ts` (new)
  - **Goal**: Seed 10,000+ users, assert `listUsers`'s search stays under SC-005's 5-second target.
  - **Acceptance Criteria**: SC-005 satisfied; skip-if-unavailable against the real test database.
  - **Verification**: `npm run test:db -- userManagementRepository.performance`
  - **Dependencies**: T044, T328

- [ ] T338 [P] Performance tests — audit log at scale
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/securityAuditRepository.performance.test.ts` (new)
  - **Goal**: Seed a large audit-log row count, assert pagination stays responsive (spec Edge Cases).
  - **Acceptance Criteria**: Test passes within a documented time budget.
  - **Verification**: `npm run test:db -- securityAuditRepository.performance`
  - **Dependencies**: T049, T329

- [ ] T339 [P] Performance tests — backup generation timing
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/backupRepository.performance.test.ts` (new)
  - **Goal**: Seed a large project (many layers/features/dashboards), assert `createBackup`'s chunked/streamed assembly completes within a documented time budget without unbounded memory growth.
  - **Acceptance Criteria**: Test passes; documented budget referenced in the PR.
  - **Verification**: `npm run test:db -- backupRepository.performance`
  - **Dependencies**: T056, T326, T330

- [ ] T340 Checkpoint (Phase 17)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm performance targets are met before Phase 18 (Accessibility) begins.
  - **Acceptance Criteria**: All of T326–T339 complete; SC-005 demonstrated passing.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T326–T339

---

## Phase 18: Accessibility

**Purpose**: Final WCAG 2.2 AA verification across both modules, per
spec.md's general accessibility expectations (this spec has no
explicitly-numbered FR/SC for accessibility, unlike 007/008, but every
prior feature's Constitution-mandated standard applies unchanged),
extending each phase's own per-component checks with a cross-module pass.

- [ ] T341 Keyboard navigation — final cross-module audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `AdminShell.tsx`, `LoginForm.tsx` (verify, from T323/T214)
  - **Goal**: Consolidate T187 (roles), T204 (permission matrix), T213/T222 (auth forms), T277 (restore dialog), T323 (integrated shell) into one final confirmation pass across both modules.
  - **Acceptance Criteria**: Every action across both modules reachable by keyboard alone.
  - **Verification**: Manual keyboard-only pass, documented in the PR; automated in T347
  - **Dependencies**: T187, T204, T277, T323

- [ ] T342 [P] ARIA labels — final cross-module audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Every component file across both modules
  - **Goal**: Consolidate every per-phase ARIA check into one final confirmation.
  - **Acceptance Criteria**: No control anywhere in either module relies on an icon alone.
  - **Verification**: Covered by T347
  - **Dependencies**: T324

- [ ] T343 [P] Focus management — final dialog audit consolidation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Every `Dialog`/`AlertDialog` across both modules (verify, extends T314)
  - **Goal**: Final confirmation pass over T314's audit, now that every dialog exists.
  - **Acceptance Criteria**: Tab never escapes an open dialog; closing returns focus predictably, across every dialog in both modules.
  - **Verification**: Covered by T347
  - **Dependencies**: T314

- [ ] T344 [P] Screen reader support — `aria-live` regions audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `LoginForm.tsx` (session-timeout re-auth prompt, T218), `MonitoringDashboard.tsx` (live updates, T289), `SecuritySettingsPanel.tsx`/`SystemSettingsPanel.tsx` (save confirmations)
  - **Goal**: Confirm live-updating content uses `aria-live="polite"`, consistent with 007/008's established convention.
  - **Acceptance Criteria**: A screen reader announces a save confirmation/timeout prompt/live metric update without requiring re-focus.
  - **Verification**: Covered by T348
  - **Dependencies**: T218, T289, T306, T311

- [ ] T345 [P] Contrast validation — status/badge colors
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `UserList.tsx` (active/inactive badges), `ApiKeyList.tsx` (expired/revoked badges), `AuditLogTable.tsx` (security-event badges), `BackupHistoryList.tsx` (succeeded/failed badges), `HealthSummaryCards.tsx` (threshold-flag colors)
  - **Goal**: This feature uses more status/color-coded badges than any prior feature (active/inactive, expired/revoked, security/routine, succeeded/failed, threshold-flagged) — verify every one meets WCAG 2.2 AA contrast, and that color is never the *only* signal (an icon/text label always accompanies it).
  - **Acceptance Criteria**: Every badge type passes automated contrast checking and has a non-color-only indicator.
  - **Verification**: Covered by T347
  - **Dependencies**: T153, T232, T245, T271, T287

- [ ] T346 [P] Contrast validation — dark/light theme confirmation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: All components audited in T345
  - **Goal**: Confirm T345's contrast requirements hold in both the existing dark and light theme (`next-themes`, already used platform-wide) — not verified in only one theme.
  - **Acceptance Criteria**: Both themes pass.
  - **Verification**: Covered by T347
  - **Dependencies**: T345

- [ ] T347 [P] Automated axe verification — full module
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/components/__tests__/module.a11y.test.tsx` (new, extends/consolidates T324), `src/features/auth/components/__tests__/module.a11y.test.tsx` (new)
  - **Goal**: One automated axe scan per module, exercising every dialog/panel/form.
  - **Acceptance Criteria**: Zero critical/serious axe violations across both modules.
  - **Verification**: `npm run test -- module.a11y`
  - **Dependencies**: T341, T342, T343, T345, T346

- [ ] T348 Manual screen reader pass
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (manual verification)
  - **Goal**: NVDA/VoiceOver spot-check of quickstart.md's full walkthrough (all ten sections).
  - **Acceptance Criteria**: Confirmed by an actual screen reader session, not just automated tooling.
  - **Verification**: Manual pass, documented in the PR
  - **Dependencies**: T344, T347

- [ ] T349 Responsive layouts — narrow-viewport accessibility audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `AdminShell.tsx` (verify, from T297)
  - **Goal**: Confirm every accessible name/keyboard path from T341–T346 remains correct at a narrow (320px) viewport width, matching Constitution's mobile-first Responsive Design standard.
  - **Acceptance Criteria**: No accessibility regression at narrow width.
  - **Verification**: Covered by T347
  - **Dependencies**: T297, T347

- [ ] T350 Checkpoint (Phase 18)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm accessibility is complete and green before Phase 19 (Testing) begins.
  - **Acceptance Criteria**: All of T341–T349 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T341–T349

---

## Phase 19: Testing

**Purpose**: Full-coverage audit and gap-fill across every tier, plus
cross-story journeys and — unique to this feature — a dedicated Security
tier, given this feature's subject matter. Most tier-specific tests were
already written per-layer (Phases 3–7) and per-story (Phases 8–16); this
phase confirms completeness rather than duplicating them.

- [ ] T351 Repository test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm every function in contracts/repository-api.md has a passing test (cross-reference T059–T063).
  - **Acceptance Criteria**: 100% of documented repository functions covered.
  - **Verification**: Manual coverage checklist against contracts/repository-api.md, documented in the PR
  - **Dependencies**: T059, T060, T061, T063

- [ ] T352 [P] Repository tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T351.
  - **Acceptance Criteria**: T351's checklist reaches 100%.
  - **Verification**: `npm run test:db`
  - **Dependencies**: T351

- [ ] T353 API test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/**/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm every endpoint in api-contracts.md has success/validation/`401`/`403`/`404`/`409`/`429` coverage (cross-reference T090/T091 and Phase 11's auth-flow tests).
  - **Acceptance Criteria**: 100% of documented endpoints × documented error codes covered.
  - **Verification**: Manual coverage checklist against api-contracts.md, documented in the PR
  - **Dependencies**: T090, T091, T224

- [ ] T354 [P] API tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/**/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T353.
  - **Acceptance Criteria**: T353's checklist reaches 100%.
  - **Verification**: `npm run test:db`
  - **Dependencies**: T353

- [ ] T355 Service test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/services/__tests__/*.test.ts`, `src/features/admin/services/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm every service method (contracts/client-api.md) is tested (cross-reference T109–T111).
  - **Acceptance Criteria**: 100% of documented service methods covered.
  - **Verification**: Manual coverage checklist, documented in the PR
  - **Dependencies**: T109, T110, T111

- [ ] T356 [P] Service tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/services/__tests__/*.test.ts`, `src/features/admin/services/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T355.
  - **Acceptance Criteria**: T355's checklist reaches 100%.
  - **Verification**: `npm run test`
  - **Dependencies**: T355

- [ ] T357 Hook test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/hooks/__tests__/*.test.ts`, `src/features/admin/hooks/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm every hook in contracts/client-api.md is tested (cross-reference T129).
  - **Acceptance Criteria**: 100% of documented hooks covered.
  - **Verification**: Manual coverage checklist against contracts/client-api.md, documented in the PR
  - **Dependencies**: T129

- [ ] T358 [P] Hook tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/hooks/__tests__/*.test.ts`, `src/features/admin/hooks/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T357.
  - **Acceptance Criteria**: T357's checklist reaches 100%.
  - **Verification**: `npm run test`
  - **Dependencies**: T357

- [ ] T359 Store test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/store/__tests__/*.test.ts`, `src/features/admin/store/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm `authStore`/`adminStore` full action/selector coverage (cross-reference T141).
  - **Acceptance Criteria**: 100% of exported actions/selectors covered.
  - **Verification**: Manual coverage checklist, documented in the PR
  - **Dependencies**: T141

- [ ] T360 [P] Store tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/store/__tests__/*.test.ts`, `src/features/admin/store/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T359.
  - **Acceptance Criteria**: T359's checklist reaches 100%.
  - **Verification**: `npm run test`
  - **Dependencies**: T359

- [ ] T361 [P] Integration test — Bootstrap → User → Role → Login cross-story journey
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/__tests__/crossStory.bootstrapUserRoleLogin.test.ts` (new)
  - **Goal**: Bootstrap Admin exists → creates a user → assigns a custom role → that user signs in → their navigation reflects exactly their role's permission groups, spanning US1/US2/US3.
  - **Acceptance Criteria**: All four stories' behavior holds correctly in one continuous session.
  - **Verification**: `npm run test -- crossStory.bootstrapUserRoleLogin`
  - **Dependencies**: T226, T170, T188

- [ ] T362 [P] Integration test — Security Settings → Audit → API Key → Downgrade cross-story journey
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/__tests__/crossStory.securityAuditApiKey.test.ts` (new)
  - **Goal**: Change a security setting → confirm it's audited → create an API key with broad scope → downgrade the creator's role → confirm the key's effective scope narrows immediately, spanning US6/US5/US7/US3.
  - **Acceptance Criteria**: All four stories' behavior holds correctly in one continuous session.
  - **Verification**: `npm run test -- crossStory.securityAuditApiKey`
  - **Dependencies**: T320, T260, T242

- [ ] T363 [P] Integration test — Backup → Restore → Audit cross-story journey
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/__tests__/crossStory.backupRestoreAudit.test.ts` (new)
  - **Goal**: Trigger a backup → restore from it → confirm both actions appear correctly in the audit trail, spanning US9/US5.
  - **Acceptance Criteria**: Both stories' behavior holds correctly in one continuous session.
  - **Verification**: `npm run test -- crossStory.backupRestoreAudit`
  - **Dependencies**: T278, T260

- [ ] T364 [P] Integration test — full quickstart.md run-through
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/__tests__/quickstart.fullRun.test.ts` (new, automating what's automatable from quickstart.md's ten sections)
  - **Goal**: A single continuous session touching every one of quickstart.md's ten sections in order.
  - **Acceptance Criteria**: All ten sections pass without requiring app state reset between them.
  - **Verification**: `npm run test -- quickstart.fullRun`
  - **Dependencies**: T226, T170, T188, T206, T260, T242, T278, T296, T325

- [ ] T365 Performance test audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `userManagementRepository.performance.test.ts`, `securityAuditRepository.performance.test.ts`, `backupRepository.performance.test.ts` (review only, from T337–T339)
  - **Goal**: Confirm T337–T339 pass against CI-representative hardware/data volume, not just a developer's local machine.
  - **Acceptance Criteria**: All three tests green in CI.
  - **Verification**: CI run review
  - **Dependencies**: T337, T338, T339

- [ ] T366 Accessibility test audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `module.a11y.test.tsx` (both modules, review only, from T347)
  - **Goal**: Confirm zero violations are maintained after Phase 17's performance-tuning changes.
  - **Acceptance Criteria**: T347 still green after Phase 17.
  - **Verification**: `npm run test -- module.a11y`
  - **Dependencies**: T340, T347

- [ ] T367 [P] Security tests — crypto primitives audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/security/__tests__/passwordHash.security.test.ts` (new, extends T016), `secretToken.security.test.ts` (new), `encryption.security.test.ts` (new)
  - **Goal**: A dedicated security-tier pass beyond T016's basic round-trip tests — password hash timing-safety, token entropy measurement, encryption tamper-detection under adversarial input.
  - **Acceptance Criteria**: Every primitive from T007–T009 withstands the dedicated security-tier scrutiny.
  - **Verification**: `npm run test -- passwordHash.security secretToken.security encryption.security`
  - **Dependencies**: T016

- [ ] T368 [P] Security tests — input validation fuzzing spot-check
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/__tests__/adminSchemas.fuzz.test.ts` (new)
  - **Goal**: Spot-check every new Zod schema (T005/T094) against malformed/adversarial input (oversized strings, injection-shaped payloads, unexpected types) — confirms Zod rejection, not a crash or silent coercion.
  - **Acceptance Criteria**: Every new schema rejects malformed input cleanly.
  - **Verification**: `npm run test -- adminSchemas.fuzz`
  - **Dependencies**: T005, T094

- [ ] T369 [P] Security tests — secret-never-in-response audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/secretExposure.audit.test.ts` (new)
  - **Goal**: Automated scan asserting no API response shape (users, API keys list, system settings) ever includes `passwordHash`/`secretHash`/`smtpPasswordEncrypted`/raw session tokens — the automated version of plan.md's Quality Gates "secret-handling audit," made repeatable rather than manual-only.
  - **Acceptance Criteria**: Zero secret field found in any tested response.
  - **Verification**: `npm run test:db -- secretExposure.audit`
  - **Dependencies**: T066, T079, T083

- [ ] T370 [P] Security tests — rate-limit/IP-restriction bypass attempts
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/security/__tests__/assertIpAllowed.bypass.test.ts` (new), `src/app/api/auth/__tests__/login.rateLimit.test.ts` (new)
  - **Goal**: Attempt to bypass `assertIpAllowed`/rate limiting via common evasion patterns (header spoofing where the platform-specific extraction logic should prevent it, rapid retries) — confirms the defenses hold, and that the break-glass token (T012) is the *only* legitimate bypass.
  - **Acceptance Criteria**: No bypass succeeds except via the documented, operator-only break-glass path.
  - **Verification**: `npm run test:db -- assertIpAllowed.bypass login.rateLimit`
  - **Dependencies**: T012, T051, T208

- [ ] T371 [P] Security tests — session integrity spot-check
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/authRepository.sessionIntegrity.test.ts` (new)
  - **Goal**: Confirm the session cookie is `httpOnly`/`Secure`/`SameSite=Lax` (plan.md's Risks-section mitigation), and that `tokenHash` values have sufficient entropy to resist guessing.
  - **Acceptance Criteria**: Cookie flags verified programmatically, not just documented.
  - **Verification**: `npm run test:db -- authRepository.sessionIntegrity`
  - **Dependencies**: T042

- [ ] T372 [P] Security tests — last-Admin invariant exhaustive test
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/userManagementRepository.lastAdmin.test.ts` (new)
  - **Goal**: Exhaustively test every code path that could reduce the Admin count to zero — deactivate, delete, role-change away, and any combination/ordering of these across concurrent requests — confirming FR-010/SC-007 holds in every case, not just the obvious one.
  - **Acceptance Criteria**: SC-007 ("never left with zero Admin-role users") verified exhaustively.
  - **Verification**: `npm run test:db -- userManagementRepository.lastAdmin`
  - **Dependencies**: T044

- [ ] T373 [P] Security tests — API key scope-escalation attempts
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/apiKeyRepository.scopeEscalation.test.ts` (new)
  - **Goal**: Attempt to create/use an API key with a scope exceeding the owner's current permissions, and attempt to use an already-created key after its owner's permissions have been reduced — confirms FR-026 holds in both directions.
  - **Acceptance Criteria**: No escalation succeeds in any tested scenario.
  - **Verification**: `npm run test:db -- apiKeyRepository.scopeEscalation`
  - **Dependencies**: T052

- [ ] T374 Full suite run
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: Run the entire test suite (all tiers, including the new Security tier) and confirm green, with zero skipped tests other than documented skip-if-unavailable DB tests.
  - **Acceptance Criteria**: `npm run test` and `npm run test:db` both fully green.
  - **Verification**: `npm run test && npm run test:db`
  - **Dependencies**: T352, T354, T356, T358, T360, T361, T362, T363, T364, T365, T366, T367, T368, T369, T370, T371, T372, T373

- [ ] T375 Checkpoint (Phase 19)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the entire feature is fully tested before Phase 20 (Documentation & Final Quality Gate) begins.
  - **Acceptance Criteria**: All of T351–T374 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T351–T374

---

## Phase 20: Documentation & Final Quality Gate

**Purpose**: Documentation per Constitution Principle VIII and the final,
whole-feature quality gate per Constitution Principle X — including,
unique to this feature, an explicit secret-handling audit (plan.md's
Quality Gates section).

- [ ] T376 README
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/auth/README.md` (new), `src/features/admin/README.md` (new)
  - **Goal**: Purpose, public API (barrel exports), a usage example, and known limitations (Constitution Principle VIII) for each module — explicitly noting that `auth`/`admin` are two separate modules with different audiences (every user vs. administrators only, plan.md's Structure Decision).
  - **Acceptance Criteria**: A new contributor can understand each module's scope and entry points from its own README.
  - **Verification**: Manual review
  - **Dependencies**: T325, T375

- [ ] T377 [P] Architecture documentation — environment variable final audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/environment-variables.md` (modify)
  - **Goal**: Final confirmation that `ADMIN_SECRETS_ENCRYPTION_KEY` and `IP_RESTRICTION_BYPASS_TOKEN` (T015) are documented with clear purpose/format/generation-instructions, extending T015's initial pass now that every consumer of both variables exists.
  - **Acceptance Criteria**: No new environment variable exists undocumented.
  - **Verification**: Manual review
  - **Dependencies**: T015

- [ ] T378 [P] API documentation — JSDoc audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Every new/modified exported function across this feature
  - **Goal**: Confirm every new/modified Route Handler and repository function carries the required single-line JSDoc summary (Constitution Principle VIII), with particular attention to every function touching a secret/token documenting exactly what is/isn't stored.
  - **Acceptance Criteria**: Zero exported function in this feature's scope lacks a summary.
  - **Verification**: Manual review (or an ESLint `jsdoc` rule if the project has one configured)
  - **Dependencies**: T325, T375

- [ ] T379 [P] RBAC documentation — role/permission-group model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/README.md` (modify, same file as T376)
  - **Goal**: A dedicated RBAC section: the four built-in roles' capability matrix, the permission-group catalog, and a step-by-step custom-role-creation guide.
  - **Acceptance Criteria**: An administrator (reading this doc, not the code) can understand exactly what each built-in role grants.
  - **Verification**: Manual review
  - **Dependencies**: T376

- [ ] T380 [P] RBAC documentation — two-role-system distinction
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/admin/README.md` (modify, same file as T376)
  - **Goal**: Prominently document the platform-wide `SystemRole` vs. 006-collaboration's per-project `ProjectMember.role` distinction (research.md Decision 5) — the single most likely point of confusion for a future contributor, given the shared "Editor"/"Viewer" naming between the two independent systems.
  - **Acceptance Criteria**: The distinction is impossible to miss for anyone reading this README before touching either system.
  - **Verification**: Manual review
  - **Dependencies**: T379

- [ ] T381 [P] Deployment guide — break-glass IP-recovery procedure
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify)
  - **Goal**: Step-by-step operator instructions for the `IP_RESTRICTION_BYPASS_TOKEN` recovery path (plan.md's Security section) — this must be discoverable *before* an administrator ever needs it, not buried in code comments only.
  - **Acceptance Criteria**: An operator unfamiliar with the codebase can follow this doc alone to recover from a lockout.
  - **Verification**: Manual review
  - **Dependencies**: T012

- [ ] T382 [P] Deployment guide — bootstrap-Admin procedure
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify, same file as T381)
  - **Goal**: Step-by-step instructions for establishing the platform's first Admin in a fresh production deployment (research.md Decision 18) — seed-script path vs. the environment-variable-driven first-run path, both documented.
  - **Acceptance Criteria**: A fresh deployment's operator knows exactly how to get their first Admin account.
  - **Verification**: Manual review
  - **Dependencies**: T038

- [ ] T383 [P] Deployment guide — backup scheduling per target
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify, same file as T381)
  - **Goal**: Document plan.md's Deployment Notes table (Vercel Cron/Railway Cron/Docker crontab/AWS EventBridge/Supabase `pg_cron`) for triggering `POST /api/backups/scheduled/run-due`, reusing (not duplicating) 008's equivalent documentation pattern.
  - **Acceptance Criteria**: Matches plan.md's Deployment Notes content exactly.
  - **Verification**: Manual review
  - **Dependencies**: T088

- [ ] T384 [P] Developer guide — secret-handling pattern
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/admin/README.md` (modify, same file as T376)
  - **Goal**: Document the shared `node:crypto` token-generate/hash-at-rest/encrypt pattern (T007–T009) as a reusable reference for any future feature that needs to handle a secret — so a future contributor reuses this pattern rather than inventing a fourth way to store a credential.
  - **Acceptance Criteria**: Pattern documented clearly enough to be followed without re-reading `secretToken.ts`'s implementation.
  - **Verification**: Manual review
  - **Dependencies**: T007, T008, T009

- [ ] T385 [P] Developer guide — `getCurrentUser` stability guarantee
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/server/auth/getCurrentUser.ts` (modify — expand its existing doc comment)
  - **Goal**: Document why this function's signature never changed despite its implementation being completely rewritten (plan.md's core finding #1) — a pattern worth calling out explicitly for any future contributor tempted to add a second parameter or change the return type.
  - **Acceptance Criteria**: The doc comment explains the stability guarantee and why it matters to every other feature in the codebase.
  - **Verification**: Manual review
  - **Dependencies**: T213

- [ ] T386 Quickstart verification — final manual pass
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (manual verification against quickstart.md)
  - **Goal**: Execute quickstart.md end-to-end manually one final time post-implementation, all ten sections plus the Failure/recovery scenarios.
  - **Acceptance Criteria**: Every scenario in quickstart.md behaves exactly as documented.
  - **Verification**: Manual pass, documented in the PR description
  - **Dependencies**: T375

- [ ] T387 Final quality gate — TypeScript
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: Zero TypeScript errors across the entire changed surface.
  - **Acceptance Criteria**: Clean `tsc --noEmit` run.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T375

- [ ] T388 Final quality gate — ESLint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: Zero ESLint errors or warnings.
  - **Acceptance Criteria**: Clean `eslint src --max-warnings 0` run.
  - **Verification**: `npm run lint`
  - **Dependencies**: T375

- [ ] T389 Final quality gate — production build + bundle analyzer + secret-handling audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: `next build` succeeds; bundle-analyzer (T336) confirms `nodemailer` stays server-only; manual re-confirmation of plan.md's Quality Gates "secret-handling audit" line item (no session token/password/reset token/API key secret/SMTP credential ever appears in a response, log line, or committed test fixture) — the automated version already exists (T369), this is the final manual sign-off.
  - **Acceptance Criteria**: Clean production build; both automated (T369) and manual secret-handling checks pass.
  - **Verification**: `npm run build`
  - **Dependencies**: T336, T369, T375

- [ ] T390 Final quality gate — Constitution Check + FR/SC traceability + Checkpoint (Phase 20)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only, cross-referencing plan.md's Constitution Check table and spec.md)
  - **Goal**: Re-verify plan.md's Constitution Check table against the actual implementation; confirm every FR-001–FR-041 and SC-001–SC-008 from spec.md has at least one traceable passing task/test from this file. This is also this feature's final phase checkpoint — the whole-suite verification below must be green before the feature is considered complete.
  - **Acceptance Criteria**: Zero principle violation found that isn't already documented in plan.md's Complexity Tracking; zero FR/SC without a traceable task; the full command suite below passes clean.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db` (manual cross-reference audit against plan.md's Constitution Check table and spec.md's FR/SC list, documented in the PR description)
  - **Dependencies**: T386, T387, T388, T389

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundation)**: No dependencies — start immediately.
- **Phase 2 (Database)**: Depends on Phase 1 (needs T002/T003's constants/types).
- **Phase 3 (Repository Layer)**: Depends on Phase 2 (needs the migrated schema); also depends on 006-collaboration's `membershipRepository.ts` and 008's `dashboardRepository.ts`/`widgetRepository.ts`/`dashboardShareRepository.ts`/`dashboardAnalyticsRepository.ts` existing (reused if landed, else implemented as a shared prerequisite — see Complexity Tracking, same sequencing pattern 007/008 already established for their own cross-feature dependencies).
- **Phase 4 (Route Handlers)**: Depends on Phase 3 (needs repository functions to call). Builds the **administrative** endpoints only — `/api/auth/*` is deferred to Phase 11.
- **Phase 5 (Client Services)**: Depends on Phase 4 for admin services; `authService.ts` (T096) is authored ahead of Phase 11's routes against api-contracts.md's already-approved shapes, with a dedicated closing-the-loop task (T132) once Phase 11 lands.
- **Phase 6 (React Query Hooks)**: Depends on Phase 5.
- **Phase 7 (Zustand Stores + `middleware.ts`)**: Depends on Phase 3 (session validation) for `middleware.ts`; can otherwise proceed alongside Phase 6.
- **Phases 8–16 (User Stories US1–US10)**: All depend on Phase 7 completing. Phase 11 (Authentication, US1) is structurally foundational — Phases 8–10, 12–16 all assume a working sign-in exists for their own integration tests, even though each phase's *component-level* work can proceed independently beforehand (mirroring how 008 sequenced its own foundational Phases 8→9→10). In execution-order terms: Phases 8, 9, 10, 12, 13, 14, 15 can all be built in parallel once Phase 7 completes, but their **integration tests** (which require a real signed-in session) are only fully runnable once Phase 11 lands — each phase's task list already reflects this by having component-level tasks depend only on that phase's own hooks/services, while integration tests depend on Phase 11 where a live session is actually needed.
- **Phase 16 (UI Components, incl. US6/US8)**: Depends on Phases 8–15 (integrates all of them) plus builds US6/US8 fresh.
- **Phase 17 (Performance)**: Depends on all of Phases 8–16.
- **Phase 18 (Accessibility)**: Depends on Phase 16; can run in parallel with Phase 17.
- **Phase 19 (Testing)**: Depends on Phases 17 and 18.
- **Phase 20 (Documentation & Final Quality Gate)**: Depends on Phase 19.

### User Story Dependencies

- **US1 (Authentication, P1)**: Structurally foundational to every other story's *usability* (a user must be able to sign in), but its own construction (Phase 11) can proceed in parallel with Phases 8–10/12–16's component-level work — only their integration tests wait on it.
- **US2 (User Management, P1)**: No dependency on other stories beyond the platform having *a* role to assign at creation time (Phase 2's seeded roles suffice; full Role Management UI, US3, is not required for US2 to function).
- **US3 (Role Management, P1)**: No dependency on other stories.
- **US4 (Permission Management, P2)**: Depends on 006/008's underlying data existing to have something to administer (Complexity Tracking).
- **US5 (Audit Logs, P2)**: Benefits from every other story producing real events to log, but its own repository/endpoint/UI work is independent.
- **US6 (Security Settings, P2)**: No dependency on other stories.
- **US7 (API Key Management, P3)**: Depends on US3 (Role Management) for scope validation against real permission groups, which exist from Phase 2's seed data regardless of whether Phase 9's UI has landed.
- **US8 (System Settings, P3)**: No dependency on other stories; US1's password-reset email depends on US8's email configuration existing operationally, but not on US8's *UI* — a valid `SystemSettings` row from seed/API suffices for US1's own tests.
- **US9 (Backup & Restore, P3)**: Benefits from real project data (every prior feature) existing, but its own construction is independent.
- **US10 (Monitoring, P3)**: Read-only oversight over data every other story produces; no functional dependents.

### Within Each Phase

- Foundational/infrastructure tasks before story-specific tasks (Phases 1–7 before 8–16).
- Repository/service confirmation before UI wiring within each user-story phase.
- Component implementation before its own tests.
- Story complete (checkpoint passes) before considering that story done.

### Parallel Opportunities

- All `[P]`-marked tasks within a phase touch different files (or are read-only verification tasks) and have no unresolved dependency on an incomplete task in the same phase.
- Once Phase 7 completes, Phases 8 (User Management), 9 (Role Management), 10 (Permission Management), 12 (API Key Management), 13 (Audit Logs), 14 (Backup & Restore), and 15 (Monitoring) can all be staffed and built fully in parallel — each depends only on Phases 1–7's shared foundation, not on each other or on Phase 11.
- Phase 11 (Authentication) should be prioritized early despite its P1 status not blocking others' component-level work, since every phase's *integration test* depends on it.
- Phase 16's US6/US8 sections (T304–T311) can be built in parallel with its integration-polish sections (T297–T303, T312–T313) once their respective source phases exist.

---

## Parallel Example: Phases 8, 9, 10, 12, 13, 14, 15 (post-Phase-7)

```bash
# Once Phase 7 completes, seven teams/agents can work these phases fully in parallel:
Team A: Phase 8  (T149–T170, User Management, US2)
Team B: Phase 9  (T171–T188, Role Management, US3)
Team C: Phase 10 (T189–T206, Permission Management, US4)
Team D: Phase 11 (T207–T226, Authentication, US1) — prioritize early
Team E: Phase 12 (T227–T242, API Key Management, US7)
Team F: Phase 13 (T243–T260, Audit Logs, US5)
Team G: Phase 14 (T261–T278, Backup & Restore, US9) + Phase 15 (T279–T296, Monitoring, US10)
```

## Parallel Example: Phase 3 (Repository Layer)

```bash
# Within Phase 3, once Phase 2 completes, these repository files are independent:
Task: "T041 Create authRepository.ts — credential creation + password verification"
Task: "T044 Create userManagementRepository.ts"
Task: "T045 Create roleRepository.ts"
Task: "T049 Create securityAuditRepository.ts"
Task: "T050 Create securitySettingsRepository.ts"
Task: "T052 Create apiKeyRepository.ts — creation + validation"
Task: "T054 Create systemSettingsRepository.ts"
```

---

## Implementation Strategy

### MVP First (Authentication + User Management)

1. Complete Phases 1–7 (Foundation → Stores/Middleware) — the shared
   platform every story needs.
2. Complete Phase 11 (US1, Authentication) — without this, nothing else
   in the platform can be attributed to a real user.
3. Complete Phase 8 (US2, User Management) — an administrator needs to
   be able to create accounts for Phase 11 to have anyone besides the
   bootstrap Admin to sign in as.
4. **STOP and VALIDATE**: run quickstart.md §1 and §2 manually; confirm
   T226's and T170's checkpoints are green.
5. Deploy/demo if ready — real sign-in plus basic user administration is
   a legitimate MVP slice, and the platform's most foundational
   capability gap (no real authentication existed before this feature).

### Incremental Delivery

1. Phases 1–7 → platform ready.
2. Phase 11 (US1) + Phase 8 (US2) → test independently → deploy/demo
   (MVP — real authentication finally exists).
3. Phase 9 (US3, Role Management) → test independently → deploy/demo.
4. Phase 10 (US4, Permission Management) → test independently → deploy/demo
   (depends on 006/008 for full data, degrades gracefully if either
   hasn't landed — Complexity Tracking).
5. Phase 13 (US5, Audit Logs) → test independently → deploy/demo.
6. Phase 6, US6 (Security Settings, built in Phase 16) → test
   independently → deploy/demo.
7. Phase 12 (US7, API Keys) → test independently → deploy/demo.
8. Phase 16's US8 (System Settings) → test independently → deploy/demo.
9. Phase 14 (US9, Backup & Restore) → test independently → deploy/demo.
10. Phase 15 (US10, Monitoring) → test independently → deploy/demo.
11. Phase 16's full integration → deploy/demo.
12. Phases 17–20 (Performance/Accessibility/Testing/Docs) → final
    hardening pass → ship.

### Parallel Team Strategy

With multiple developers/agents:

1. Team completes Phases 1–7 together (Foundation is inherently
   sequential/shared, and `getCurrentUser`'s rewrite plus `middleware.ts`
   are singular, high-stakes changes best done by one owner).
2. Once Phase 7 is done:
   - Developer/Agent A: Phase 11 (US1) — prioritized first given every
     other phase's integration tests depend on it
   - Developer/Agent B: Phase 8 (US2)
   - Developer/Agent C: Phase 9 (US3)
   - Developer/Agent D: Phase 10 (US4) — coordinate with 006/008's own
     implementation timeline
   - Developer/Agent E: Phase 12 (US7) + Phase 13 (US5)
   - Developer/Agent F: Phase 14 (US9) + Phase 15 (US10)
3. Once Phases 8–15 exist, one developer/agent builds Phase 16's full
   integration (including its own US6/US8 sections), then the whole team
   converges for final integration.
4. Phases 17–20 run as a shared final pass once Phase 16 is integrated.

---

## Notes

- `[P]` tasks touch different files (or are read-only verification/audit
  tasks) with no unresolved same-phase dependency.
- `[US#]` labels map every Phase 8–16 task to its spec.md user story
  (per plan.md's established numbering: US1 Authentication, US2 User
  Management, US3 Role Management, US4 Permission Management, US5 Audit
  Logs, US6 Security Settings, US7 API Key Management, US8 System
  Settings, US9 Backup & Restore, US10 Monitoring) for traceability;
  Phases 1–7 and 17–20 carry no story label (cross-cutting). Phase 16
  mixes US1/US3/US4/US5/US6/US7/US8/US9/US10 labels where the roadmap
  outline's theme-based phase name doesn't align 1:1 with spec.md's
  story boundaries — each task's label reflects the story it factually
  belongs to.
- Per the Architecture note at the top of this file: several concepts
  named in the originally-requested phase outline ("User Profile,"
  "UserRole," "ProjectPermission"/"LayerPermission"/"Feature Permissions,"
  "SecurityEvent"/"LoginHistory," "BackupHistory," "UserRepository,"
  "SecurityRepository"/"SettingsRepository," "Database Statistics,"
  "Error Statistics," six of the roadmap's seven named Zustand stores)
  are implemented as fields/functions on the approved, already-designed
  schema, the split repository files, or are explicitly confirmed
  out-of-scope/consolidated per data-model.md/research.md — never as
  additional tables, files, or stores invented to match a name in the
  outline. Every task above says explicitly which real artifact (or
  explicit non-implementation) a named concept maps to.
- Every acceptance criterion above cites a spec.md `FR-`/`SC-`/
  Acceptance-Scenario id it satisfies, so traceability back to spec.md
  is auditable task-by-task.
- This feature's `getCurrentUser.ts` rewrite (T213) is the single
  highest-stakes task in this roadmap — every other feature in the
  codebase (003–008) depends on its signature staying exactly as-is.
  Treat any deviation from that signature during implementation as a
  stop-and-reassess signal, not a minor refactor.
- Commit after each task or logical group; stop at any checkpoint to
  validate a phase/story independently before continuing.
- Avoid: vague tasks, same-file conflicts on `[P]`-marked tasks, and
  cross-story dependencies that would break a story's independent
  testability beyond the one documented, unavoidable coupling
  (every phase's integration tests needing Phase 11's real sign-in to
  exist).

