# Repository Contract: Administration & Security (009)

**Feature**: 009-administration-security

Nine new repository files, each owning one primary table-group, matching
every prior feature's one-file-per-concern convention.

---

## `authRepository.ts` (new)

Owns `UserCredential`, `Session`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `createUserWithCredential` | `{ email, name?, systemRoleId, password? }` | `UserRecord` | Used by both self-registration (with `password`) and admin-created accounts (without — a reset-token is issued instead, `issuePasswordSetupToken` below) |
| `verifyPassword` | `email`, `password` | `UserRecord \| null` | `scrypt`-compares (research.md Decision 3); returns `null` for both "no such user" and "wrong password" (FR-006's non-disclosure, enforced here so no caller can accidentally leak the distinction) |
| `createSession` | `userId`, `{ isPersistent, ipAddress, userAgent }` | `{ session: SessionRecord; rawToken: string }` | `rawToken` is returned once, for the cookie — never persisted (research.md Decision 1) |
| `validateSession` | `rawToken` | `UserRecord \| null` | Hashes the token, joins to `User`, checks `expiresAt` **and** `User.isActive` on every call (spec Edge Cases — deactivation invalidates immediately) |
| `deleteSession` | `sessionId` or `rawToken` | `void` | Sign-out (FR-004) |
| `deleteAllSessionsForUser` | `userId` | `void` | Called on deactivation and on password-reset completion |
| `issuePasswordSetupToken` / `issuePasswordResetToken` | `userId` | `{ rawToken: string }` | Same hash-at-rest pattern (research.md Decision 4); admin-created-user setup and self-service reset share this function |
| `consumePasswordResetToken` | `rawToken`, `newPassword` | `UserRecord` | Validates not-expired/not-already-used, hashes and sets the new password, clears the token, calls `deleteAllSessionsForUser` |

## `userManagementRepository.ts` (new)

Owns `User`'s admin-facing operations (the existing `getUserById` in
`userRepository.ts` is unchanged and reused, not duplicated).

| Function | Input | Output | Notes |
|---|---|---|---|
| `listUsers` | `params: { cursor?, limit?, search? }` | `{ users: UserSummary[]; nextCursor }` | Never selects `UserCredential.passwordHash` (join-excluded) |
| `updateUser` | `userId`, `{ name?, systemRoleId?, isActive? }` | `UserRecord` | Throws `ValidationError` if the change would leave zero active Admin-role users (FR-010) — the one cross-cutting invariant check every user-mutating function in this repository shares |
| `softDeleteUser` | `userId` | `void` | Sets `deletedAt`, `isActive: false`; same last-Admin guard as `updateUser` |
| `getMyProfile` / `updateMyProfile` | `userId`, `{ name?, currentPassword?, newPassword? }` | `UserRecord` | `newPassword` requires a correct `currentPassword` (re-uses `verifyPassword`) |

## `roleRepository.ts` (new)

Owns `SystemRole`, `PermissionGroup`, `SystemRolePermissionGroup`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `listRoles` / `listPermissionGroups` | — | `SystemRoleRecord[]` / `PermissionGroupRecord[]` | |
| `createRole` | `{ name, permissionGroupKeys }` | `SystemRoleRecord` | |
| `updateRole` | `roleId`, `{ name?, permissionGroupKeys? }` | `SystemRoleRecord` | Throws `ForbiddenError` if `isBuiltIn` (data-model.md) |
| `deleteRole` | `roleId` | `void` | Throws `ValidationError` if any `User.systemRoleId` references it (FR-013); throws `ForbiddenError` if `isBuiltIn` |

## `permissionRepository.ts` (new)

Thin composition layer — no new permission-storage of its own beyond
`SystemRole`'s (already owned by `roleRepository.ts`); this file's job is
combining 006's and 008's existing repositories into one admin-facing
read/write surface (research.md Decision — reuse, not duplicate).

| Function | Input | Output | Notes |
|---|---|---|---|
| `getProjectPermissionsView` | `projectId` | `{ members: ProjectMemberRecord[]; dashboardShares: DashboardShareRecord[] }` | Calls 006's `membershipRepository`/008's `dashboardShareRepository` directly — no re-implementation of either's query logic |
| `updateProjectMemberRole` | `projectId`, `userId`, `role` | `void` | Pass-through to 006's existing role-change function |
| `updateDashboardShare` | `dashboardId`, `userId`, `permission` | `void` | Pass-through to 008's `dashboardShareRepository.grantShare` |
| `getDefaultPolicy` / `updateDefaultPolicy` | — | `DefaultPolicyRecord` | New, small config (part of `SystemSettings` or a dedicated small table — resolved in data-model.md as fields on `SystemSettings` where it fits the "closed set of settings" pattern; if the eventual policy shape grows more open-ended than System Settings' fixed columns comfortably support, this is flagged as a design point for `/speckit-tasks` to resolve at implementation time, not left ambiguous here as a blocking unknown) |

## `securityAuditRepository.ts` (new)

Owns `SecurityAuditLog`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `recordSecurityEvent` | `{ eventType, category, userId?, attemptedEmail?, actorUserId?, targetType?, targetId?, metadata?, ipAddress? }` | `void` | Called inside the same transaction as the action it records (data-model.md's append-only, no-separate-best-effort-call rule, mirroring `Activity`) |
| `listAuditLog` | `params: { from?, to?, category?, cursor?, limit? }` | `{ entries: AuditLogEntry[]; nextCursor }` | Merges `SecurityAuditLog` rows with 006's `Activity` rows chronologically (research.md Decision 10) — queries both tables, sorts client-side of this function (server-side of the HTTP boundary), never writes into either table from the other |
| `exportAuditLog` | same `params` | `Buffer`/stream | Same filter, streamed/serialized for download (FR-019) |

## `securitySettingsRepository.ts` (new)

Owns `SecuritySettings`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `getSecuritySettings` | — | `SecuritySettingsRecord` | Upserts the singleton row on first read if absent (defensive — seed data should already create it) |
| `updateSecuritySettings` | `userId`, `input` | `SecuritySettingsRecord` | Writes a `SecurityAuditLog` row (`recordSecurityEvent`) in the same transaction (FR-024) |

## `apiKeyRepository.ts` (new)

Owns `ApiKey`, `ApiKeyUsageLog`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `createApiKey` | `userId`, `{ name, scope, projectId?, expiresAt? }` | `{ apiKey: ApiKeyRecord; rawSecret: string }` | Validates `scope ⊆` the user's current role's permission groups (FR-026) |
| `validateApiKeyRequest` | `rawSecret` | `{ apiKey: ApiKeyRecord; effectiveScope: string[] } \| null` | Re-intersects `scope` against the owner's **current** role's groups live (research.md Decision 9) — `null` for expired/revoked/unknown |
| `rotateApiKey` | `keyId`, `userId` | `{ apiKey: ApiKeyRecord; rawSecret: string }` | Creates a new `ApiKey` row with `rotatedFromKeyId` set, revokes the old one |
| `updateApiKey` / `revokeApiKey` | `keyId`, `userId`, `input` | `ApiKeyRecord` | |
| `recordApiKeyUsage` | `apiKeyId`, `{ endpoint, statusCode }` | `void` | Best-effort, not transaction-coupled to the request it logs (data-model.md's deliberate exception) |
| `listApiKeyUsage` | `keyId`, `userId`, `params` | `{ entries: ApiKeyUsageLogRecord[]; nextCursor }` | |

## `systemSettingsRepository.ts` (new)

Owns `SystemSettings`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `getSystemSettings` | — | `SystemSettingsRecord` (never includes decrypted `smtpPasswordEncrypted`) | |
| `updateSystemSettings` | `userId`, `input` | `SystemSettingsRecord` | Encrypts `smtpPassword` (research.md Decision 14) before storing as `smtpPasswordEncrypted`; writes a `SecurityAuditLog` row |
| `sendTestEmail` | current settings | `{ success: boolean; message?: string }` | Decrypts, builds a `nodemailer` transport, sends; never persists or logs the decrypted credential |

## `backupRepository.ts` (new)

Owns `Backup`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `createBackup` | `projectId`, `{ trigger, triggeredByUserId? }` | `BackupRecord` | Calls `layerRepository`/`featureRepository`/`dashboardRepository`/`widgetRepository` directly (research.md Decision 15) to assemble the archive; enforces the retention cap (prunes oldest beyond `SystemSettings.backupRetentionCount`) in the same transaction |
| `listBackupsForProject` | `projectId`, `params` | `{ backups: Omit<BackupRecord, "fileContent">[]; nextCursor }` | |
| `getBackupFileForDownload` | `backupId` | `{ fileContent: Buffer } \| null` | |
| `restoreProject` | `backupId`, `{ targetProjectId, confirmOverwrite }` | `Project` | Single transaction: replaces target project's layers/features/dashboards/widgets from the backup's content; rolls back entirely on any failure (FR-037) |
| `runDueScheduledBackups` | *(no user — cron endpoint)* | `{ processed: number; failed: number }` | Per-project failure isolation, mirroring 008's `runDueScheduledReports` (research.md Decision 16) |

## `monitoringRepository.ts` (new)

| Function | Input | Output | Notes |
|---|---|---|---|
| `getMonitoringOverview` | — | `{ storage, users, api, performance, flags }` | Delegates storage/user aggregates to a platform-wide extension of 008's `dashboardAnalyticsRepository` pattern; API stats from `ApiKeyUsageLog`; performance/flags derived from recent `SecurityAuditLog` failure rates + configured thresholds (`SystemSettings.storageLimitBytesPerProject`, etc.) |
| `checkHealth` | — | `{ status; database }` | One cheap `SELECT 1`-equivalent query; no auth required at the Route Handler layer for this one function's caller |

---

## Reused, not duplicated (from existing repositories)

| Existing function | Reused for |
|---|---|
| 006's `membershipRepository`/role-change functions | `permissionRepository.getProjectPermissionsView`/`updateProjectMemberRole` |
| 008's `dashboardShareRepository` | `permissionRepository`'s dashboard-share view/update |
| 008's `dashboardAnalyticsRepository` compute-if-stale pattern | `monitoringRepository.getMonitoringOverview`'s caching shape (extended platform-wide, not re-invented) |
| `featureRepository.ts`/`layerRepository.ts`/`dashboardRepository.ts`/`widgetRepository.ts` (003/004/008) | `backupRepository.createBackup`/`restoreProject`'s data assembly, called directly server-side |
| `assertWriteRateLimit` (existing) | Every write endpoint, new `"auth:signin"`/`"auth:password-reset"`/`"admin:write"` buckets |
| `handleRouteError`/`toErrorResponse` (existing) | Every Route Handler in this feature, unchanged |

## Cross-cutting rules

- No repository function in this feature accepts a raw, unvalidated
  request body — every Route Handler Zod-parses first.
- Every administrative repository function's write path calls
  `securityAuditRepository.recordSecurityEvent` in the same transaction
  as the change it makes — no administrative mutation is ever silently
  unaudited.
- `authRepository.ts`/`apiKeyRepository.ts` are the only files that
  ever handle a raw secret/token/password — every other file receives
  already-hashed or already-validated identifiers.
