# API Contracts: Administration & Security (009)

**Feature**: 009-administration-security

Five resource families: `/api/auth*` (unauthenticated-entry
authentication flows), `/api/admin/users*`, `/api/admin/roles*`,
`/api/admin/audit-log*`, `/api/admin/security-settings*`,
`/api/admin/system-settings*`, `/api/admin/permissions*` (all
`assertSystemPermission`-gated), `/api/api-keys*` (self-service, any
signed-in user), `/api/projects/:projectId/backups*`, and `GET
/api/health` (unauthenticated). Every authenticated endpoint follows
`getCurrentUser` → `assertSystemPermission`/ownership check →
`assertWriteRateLimit` → Zod validate → repository call →
`handleRouteError`, per research.md Decision 6.

---

## Authentication (unauthenticated entry points)

### `POST /api/auth/register`

Creates a new user account with a password (self-service registration —
gated by `SystemSettings`/policy whether open registration is even
permitted; if not, only `POST /api/admin/users` — below — creates
accounts). *(Note: if the platform disables open self-registration, this
endpoint returns `403`; the bootstrap Admin, research.md Decision 18, is
never created through this path.)*

**Request**: `{ email: string, password: string, name?: string }`

**Response — 201**: `{ user: { id, email, name } }` (no session issued
automatically — the caller signs in separately, matching a standard
verify-then-login flow)

**Errors**: `400 INVALID_INPUT` (password fails policy, FR-020);
`409 DUPLICATE_NAME` (email already registered — but see FR-006: sign-in
failure messages don't disclose registration state; registration's own
`409` is acceptable since the *user is actively trying to register that
email*, not probing someone else's).

### `POST /api/auth/login`

**Request**: `{ email: string, password: string, rememberMe: boolean }`

**Response — 200**: Sets the session cookie (research.md Decision 1);
body `{ user: { id, email, name, systemRole } }`.

**Errors**: `401 UNAUTHORIZED` — identical message for "no such email"
and "wrong password" (FR-006); `429 RATE_LIMITED` (`"auth:signin"`
bucket, `SecuritySettings.signInRateLimitPerMinute`); `403 FORBIDDEN`
(the account is `isActive: false`, or the request's IP fails
`SecuritySettings`' allow/deny list — checked before password
verification even runs, research.md Decision 11).

### `POST /api/auth/logout`

**Response — 204**; deletes the `Session` row and clears the cookie
(FR-004).

### `POST /api/auth/password-reset/request`

**Request**: `{ email: string }`

**Response — 200** always (never discloses whether the email is
registered — same non-disclosure principle as login, FR-006 extended to
this flow); sends an email (research.md Decision 8) only if the email
matches a real, active account.

**Errors**: `429 RATE_LIMITED` (`"auth:password-reset"` bucket).

### `POST /api/auth/password-reset/confirm`

**Request**: `{ token: string, newPassword: string }`

**Response — 200**: `{ success: true }`; invalidates the token and every
existing `Session` for that user (a password reset should not leave
old sessions valid).

**Errors**: `400 INVALID_INPUT` (token invalid/expired/already used —
spec Edge Cases; new password fails policy).

### `GET /api/auth/session`

Returns the current session's user, or `401` if none — the one endpoint
every authenticated client-side hook polls/calls on app load to
establish "who am I."

---

## User Management (`/api/admin/users*`, requires `manage_users`)

### `GET /api/admin/users`

Cursor-paginated, searchable (`?search=`) user list (FR-007, US1 AC2).

**Response — 200**: `{ users: UserSummary[], nextCursor }` — `UserSummary`
never includes `passwordHash`.

### `POST /api/admin/users`

Administrator-created account (US1 AC1) — issues a password-setup link
via email rather than accepting a password directly, reusing the
password-reset token mechanism (research.md Decision 4) for the initial
setup.

**Request**: `{ email: string, name?: string, systemRoleId: string }`

**Response — 201**: `{ user: UserSummary }`

### `PATCH /api/admin/users/:userId`

Updates `name`/`systemRoleId`/`isActive` (deactivate/reactivate, FR-007/
US1 AC3–4).

**Errors**: `400 INVALID_INPUT` (attempting to deactivate/demote the
platform's last Admin, FR-010, spec Edge Cases).

### `DELETE /api/admin/users/:userId`

Soft-deletes (FR-007, `deletedAt` set — data-model.md).

**Errors**: `400 INVALID_INPUT` (last Admin, same rule as above).

### `GET`/`PATCH /api/users/me`

Self-service profile (US1 AC6, FR-009) — any signed-in user, no
`manage_users` permission required; `PATCH` supports name and (via a
current-password-required sub-flow) password change.

---

## Role Management (`/api/admin/roles*`, requires `manage_roles`)

### `GET /api/admin/roles`

Lists all `SystemRole` rows with their assigned `PermissionGroup`s.

### `POST /api/admin/roles`

Creates a custom role (FR-012).

**Request**: `{ name: string, permissionGroupKeys: string[] }`

**Errors**: `400 INVALID_INPUT` (an unknown `permissionGroupKey`).

### `PATCH /api/admin/roles/:roleId`

Updates a custom role's name/groups.

**Errors**: `403 FORBIDDEN` (attempting to modify a built-in role's
groups, data-model.md's `isBuiltIn` rule).

### `DELETE /api/admin/roles/:roleId`

**Errors**: `400 INVALID_INPUT` (role currently assigned to ≥1 user,
FR-013); `403 FORBIDDEN` (built-in role).

### `GET /api/admin/permission-groups`

Lists the fixed `PermissionGroup` catalog (for the role-creation UI's
checklist).

---

## Permission Management (`/api/admin/permissions*`, requires `manage_permissions`)

### `GET /api/admin/permissions/projects/:projectId`

Returns the project's `ProjectMember` roles and `DashboardShare` grants
in one combined view (US4 AC1/3; reuses 006/008's existing repository
reads, does not duplicate their data).

### `PATCH /api/admin/permissions/projects/:projectId/members/:userId`

Changes/revokes a project role — thin pass-through to 006's existing
membership-role-change repository function.

### `PATCH /api/admin/permissions/dashboards/:dashboardId/shares/:userId`

Revokes/changes a dashboard share — thin pass-through to 008's existing
`dashboardShareRepository`.

### `GET`/`PATCH /api/admin/permissions/default-policy`

Reads/updates the default permission policy applied to newly created
projects (US4 AC4/5).

---

## Audit Logs (`/api/admin/audit-log*`, requires `view_audit_logs`)

### `GET /api/admin/audit-log`

**Query params**: `from?`, `to?`, `category?` (`activity` |
`security_event`), `cursor?`, `limit?`.

**Response — 200**: `{ entries: AuditLogEntry[], nextCursor }` — merges
`SecurityAuditLog` and 006's `Activity` chronologically (research.md
Decision 10), each entry tagged with its `source: "security" |
"project_activity"`.

### `POST /api/admin/audit-log/export`

Same filter shape as the list; returns a downloadable file (FR-019,
US5 AC5).

---

## Security Settings (`/api/admin/security-settings`, requires `manage_security_settings`)

### `GET`/`PATCH /api/admin/security-settings`

Reads/updates the `SecuritySettings` singleton (FR-020–023). Every
`PATCH` writes a `SecurityAuditLog` row in the same transaction (FR-024).

**Errors**: `400 INVALID_INPUT` (e.g., a malformed IP/CIDR entry in the
allow/deny list).

---

## API Key Management (`/api/api-keys*`, self-service; admin override via `manage_api_keys`)

### `GET`/`POST /api/api-keys`

Lists the caller's own keys / creates one (US7 AC1). `manage_api_keys`
permits creating/listing on another user's behalf.

**Request** (`POST`): `{ name: string, scope: string[], projectId?: string, expiresAt?: string }`

**Response — 201**: `{ apiKey: { id, name, secret, scope, ... } }` —
`secret` is present **only** in this one response, never again (FR-025).

**Errors**: `400 INVALID_INPUT` (`scope` exceeds the creating user's
current permission groups, FR-026/research.md Decision 9).

### `POST /api/api-keys/:keyId/rotate`

Issues a new secret for the same key identity (FR-027, US7 AC2).

**Response — 200**: `{ apiKey: { id, secret, ... } }` (new secret shown
once).

### `PATCH /api/api-keys/:keyId`

Updates `expiresAt` (extend) (US7 AC3).

### `DELETE /api/api-keys/:keyId`

Revokes immediately (FR-027, US7 AC4).

### `GET /api/api-keys/:keyId/usage`

Paginated usage log (FR-028, US7 AC5).

---

## System Settings (`/api/admin/system-settings`, requires `manage_system_settings`)

### `GET`/`PATCH /api/admin/system-settings`

Reads/updates the `SystemSettings` singleton (US8 AC1–3, FR-029/031).
`smtpPasswordEncrypted` is never returned; `PATCH` accepts a new
`smtpPassword` (plaintext in transit over HTTPS, encrypted at rest
immediately, research.md Decision 14) but the response never echoes it.

### `POST /api/admin/system-settings/test-email`

Sends a test email using the currently configured (or just-submitted,
unsaved) SMTP settings (FR-032, US8 AC4).

**Response — 200**: `{ success: boolean, message?: string }`

**Errors**: `400 INVALID_INPUT` (SMTP config incomplete/invalid).

---

## Backup & Restore (`/api/projects/:projectId/backups*`, requires project Owner or `manage_backups`)

### `GET`/`POST /api/projects/:projectId/backups`

Lists backup history / triggers an on-demand backup (US9 AC1).

**Response — 201** (`POST`): `{ backup: Omit<Backup, "fileContent"> }`

### `GET /api/backups/:backupId/download`

Streams `fileContent` (US9 AC3).

**Errors**: `404 NOT_FOUND` (no `fileContent`, i.e. a failed backup).

### `POST /api/backups/:backupId/restore`

Restores into the same project (default) or `{ targetProjectId }`
(US9 AC4). Requires `{ confirmOverwrite: true }` in the body when the
target project has been modified since the backup was taken (spec Edge
Cases) — omitting it when required returns `409` with the current
target-modification timestamp so the client can present the warning.

**Response — 200**: `{ project: Project }`

**Errors**: `409 CONFLICT`-shaped `INVALID_INPUT` (confirmation required
but not given); `400 INVALID_INPUT` (malformed backup file — and per
FR-037, the target project is left unmodified in this case, verified in
repository tests, not just documented).

### `POST /api/backups/scheduled/run-due`

Cron-triggered (research.md Decision 16), `X-Cron-Secret` header
authenticated, **not** `getCurrentUser`.

**Response — 200**: `{ processed: number, failed: number }`

**Errors**: `401 UNAUTHORIZED` (missing/incorrect secret).

---

## Monitoring (`/api/admin/monitoring*`, requires `view_monitoring`) + Health

### `GET /api/health`

**Unauthenticated.** `{ status: "ok" | "degraded", database: "ok" | "error" }`.

### `GET /api/admin/monitoring/overview`

Storage/user/API statistics + performance indicator (US10 AC1–3,
research.md Decision 17).

**Response — 200**: `{ storage: {...}, users: {...}, api: {...}, performance: {...}, flags: string[] }`
— `flags` lists any metric currently over its configured threshold
(US10 AC4, FR-039).

---

## Validation & Error Responses (cross-cutting)

- Every request body is Zod-parsed before any repository call —
  `auth.schema.ts`, `userManagement.schema.ts`, `role.schema.ts`,
  `securitySettings.schema.ts`, `apiKey.schema.ts`,
  `systemSettings.schema.ts`, `backup.schema.ts` (all new, following
  every prior feature's per-concern schema-file convention).
- `FORBIDDEN` is added to the shared `ApiErrorCode` vocabulary by this
  feature if not already present (research.md Decision 7).

| HTTP Status | `code` | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Malformed body, password policy failure, expired/invalid reset token, last-Admin protection violation, malformed backup file |
| 401 | `UNAUTHORIZED` | No resolvable session/API key, or (login only) invalid credentials |
| 403 | `FORBIDDEN` | Resolved user's system role lacks the required permission group; IP blocked; built-in role modification attempt |
| 404 | `NOT_FOUND` | User/role/key/backup/settings target not found or not visible |
| 409 | `DUPLICATE_NAME` \| conflict-shaped `INVALID_INPUT` | Email already registered; restore confirmation required |
| 429 | `RATE_LIMITED` | Sign-in/password-reset/admin-write rate limit exceeded |
| 500 | `DATABASE_ERROR` | Unexpected failure |
