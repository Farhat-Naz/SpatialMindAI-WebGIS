# Implementation Plan: Administration & Security

**Branch**: `009-administration-security` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-administration-security/spec.md`

---

## Summary

This plan covers the full 009 spec — all ten user stories (Authentication,
User Management, Role Management, Permission Management, Audit Logs,
Security Settings, API Key Management, System Settings, Backup &
Restore, Monitoring) — as **the platform's first real authentication
system**, replacing the interim, single-user `DEV_USER_ID` seam
documented in `src/server/auth/getCurrentUser.ts`, plus a full
administrative layer built on top of it.

Five findings shape this plan significantly:

1. **This is a foundational replacement, not an addition.** `getCurrentUser`'s
   existing signature (`(request: Request) => Promise<User>`) is preserved
   exactly — every other feature (003–008) already resolves the acting
   user through this one seam, so replacing its interim body with real
   session validation requires **zero changes** to any other feature's
   Route Handlers, repositories, or authorization checks.
2. **Almost everything reuses `node:crypto` and Prisma directly** — no
   auth framework, no session library. Exactly **one** new npm
   dependency is introduced platform-wide: `nodemailer` (the platform's
   first outbound-email capability, needed for password reset).
3. **Platform-wide "system roles" (Admin/Manager/Editor/Viewer, custom)
   are a deliberately separate concept** from 006-collaboration's
   per-project membership roles of the same names — two independent role
   vocabularies, never conflated (research.md Decision 5).
4. **`SecurityAuditLog` is a new, narrow table for events with no project
   context** (sign-ins, user management, security/system settings
   changes) — 006's `Activity` table is untouched and remains the record
   for project-scoped actions; the platform-wide Audit Log view merges
   both at the query layer, never duplicating one into the other
   (research.md Decision 10).
5. **Backups are server-generated and server-stored** (a Postgres `Bytes`
   column, reusing 008's `Report` precedent exactly), unlike ad-hoc
   exports elsewhere in the platform, because a scheduled backup has no
   browser present when it runs — the same structural reason 008's
   scheduled Reports had to be server-side (research.md Decision 15).

---

## Technical Context

**Language/Version**: TypeScript 5 (strict mode — unchanged)

**Primary Dependencies**:
- next@16, react@19/react-dom@19, @tanstack/react-query@5, zustand@5, zod
  (existing — reused, no new state/validation library)
- `node:crypto` (Node.js built-in) — session tokens, password hashing
  (`scrypt`), password-reset/API-key tokens, and AES-256-GCM encryption
  for stored secrets (research.md Decisions 1, 3, 4, 9, 14) — **zero new
  dependency** for any of this
- shadcn/ui (existing — `Dialog`/`AlertDialog`/form primitives for every
  admin panel; Recharts, already introduced by 008, reused unchanged for
  Monitoring's charts — no second charting setup)
- **One new npm dependency**: `nodemailer` (research.md Decision 8) —
  provider-agnostic SMTP email for password reset and admin-configured
  notifications; must clear `@next/bundle-analyzer` (server-only usage,
  so no client-bundle impact expected, verified not assumed)

**Storage**: Twelve schema changes — one modified model (`User`, additive
fields only) and eleven new models (`UserCredential`, `Session`,
`SystemRole`, `PermissionGroup`, `SystemRolePermissionGroup`,
`SecurityAuditLog`, `SecuritySettings`, `ApiKey`, `ApiKeyUsageLog`,
`SystemSettings`, `Backup`) — data-model.md. One migration. No existing
column, index, or model beyond `User` changes; 006's `Activity` and every
other prior feature's models are completely untouched.

**Testing**: Vitest + React Testing Library (unchanged). New Route
Handlers tested against the real ephemeral PostGIS test database,
skip-if-unavailable, per every prior feature's established pattern. New
tiers specific to this feature: authentication-flow tests (login/logout/
reset/session-expiry), the last-Admin-protection invariant (tested from
every angle: deactivate, delete, role-change), and restore-failure
data-integrity tests (a corrupted backup must never partially overwrite
a project).

**Target Platform**: Unchanged — Node.js runtime, single Postgres/PostGIS
instance. The one platform-sensitive piece (scheduled backups' trigger)
reuses 008's exact externally-triggered-idempotent-endpoint pattern, so
no new platform-specific code path is introduced beyond what 008 already
established and documents per deployment target.

**Project Type**: Web application — single Next.js app. Adds two new
top-level client feature modules, `src/features/auth/` and
`src/features/admin/`, following the exact same internal structure every
existing feature module uses. Adds one `middleware.ts` at the project
root (page-level auth-gate redirect only, research.md Decision 12) — the
first file of its kind in this codebase, additive, not a modification of
any existing routing. Adds ~35 new Route Handler files under `app/api/`.

**Performance Goals** (from spec Success Criteria):
- SC-001: sign-in / password-reset-and-sign-back-in in under 3 minutes,
  no admin intervention.
- SC-002: an admin-created user can sign in within 2 minutes of creation.
- SC-003: 100% of sign-ins, admin actions, and security events correctly
  attributed in the audit log.
- SC-004: 100% of unauthorized administrative attempts blocked, zero
  resulting data changes.
- SC-005: user search across ≥10,000 users returns in under 5 seconds.
- SC-006: a restored project's spatial data matches its backup exactly.
- SC-007: the platform is never left with zero Admin-role users.
- SC-008: the health dashboard is assessable in under 30 seconds.

**Constraints**:
- No auth framework, no new session/crypto dependency — `node:crypto` +
  Prisma only (research.md Decisions 1–4, 9, 14).
- `getCurrentUser`'s existing call signature is preserved exactly — no
  other feature's code changes.
- MFA is data-model-ready only; no working second-factor verification
  ships this phase (spec.md's resolved Assumption, FR-005).
- Backups are application-level (structured export/reimport), never an
  OS-level database-server backup (spec.md's resolved Assumption).
- API keys never exceed their owning user's current, live permissions
  (FR-026, checked at request time, not creation time).
- The platform's last Admin-role user can never be deactivated, deleted,
  or role-changed away (FR-010, spec Edge Cases) — enforced in every
  user-mutating repository function, not just the UI.

**Scale/Scope**: One modified model, eleven new models, nine new
repository files, ~35 new Route Handler files, seven new Zod contract
files, two new client feature modules (~9 services/9 hooks/2 stores/~30
components combined), one new `middleware.ts`, and one new npm
dependency.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1
design — see bottom of this section.*

| Principle | Check | Notes |
|---|---|---|
| I. Architecture (Feature-First) | ✅ PASS | New client code lives entirely in the two new `src/features/auth/`/`src/features/admin/` modules with their own barrels; nine new repository files own their respective tables; `middleware.ts` is a thin, additive redirect gate, never a second enforcement authority (research.md Decision 12) |
| II. Type Safety | ✅ PASS | Every new Zod schema follows the established per-concern-file, discriminated-where-needed pattern (e.g., `widget.schema.ts`'s precedent for `apiKey.schema.ts`'s scope validation); zero `any` |
| III. Database | ✅ PASS | Additive migration only (one modified model, eleven new); no existing index/column/relation altered; `User.systemRoleId`'s required-FK addition follows the established add-nullable→backfill→tighten migration shape (007/008 precedent) |
| IV. GIS Principles | ✅ PASS | This feature introduces no new geometry column and no spatial computation — `Backup`'s content includes existing, already-PostGIS-validated geometry data verbatim, computing nothing new |
| V. Performance | ✅ PASS | The one new dependency (`nodemailer`) is server-only, never bundled client-side; `Session.lastActivityAt` updates are throttled (Performance section below) to avoid a write on every single request; audit-log queries are cursor-paginated and indexed |
| VI. Security | ✅ PASS | This feature *is* the security layer — every design decision (Decisions 1, 3, 4, 9, 14 in research.md) is explicitly about strengthening, not weakening, the platform's security posture; secrets (SMTP password, session tokens, API key secrets, reset tokens) are never stored in plaintext or logged (research.md Decision 14) |
| VII. Testing | ✅ PASS | Unit/store/hook/API/integration/accessibility tiers planned per user story, plus new authentication-flow and last-Admin-invariant tiers (Testing Strategy) |
| VIII. Documentation | ✅ PASS | spec→plan→(tasks→implementation→tests→docs) lifecycle in progress; JSDoc required on every new exported function, especially every function touching a secret/token (documenting exactly what is/isn't stored) |
| IX. Git Workflow | ✅ PASS (process) | Standard workflow applies |
| X. Quality Gates | ✅ PASS | TypeScript/ESLint/tests/`next build` all gate merge; the one new dependency triggers a mandatory bundle-analyzer confirmation that it is server-only |

**No violations.**

**Re-check after Phase 1 design**: Confirmed still PASS. `data-model.md`
and `contracts/` confirm the scope stays at one modified model, eleven
new models, and one new server-only npm dependency — no further
deviation surfaced during design. Unlike 007/008, this plan has **no**
dependency on another not-yet-implemented feature (it depends on
006-collaboration's `Activity` model and 008's `Report`/scheduling
*patterns* as design precedent, not on their code existing first — see
Complexity Tracking for the one specific exception, permission
management's reuse of 006/008's *repository functions*, which does
require those to exist).

---

## Project Structure

### Documentation (this feature)

```text
specs/009-administration-security/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/              # Phase 1 output
│   ├── api-contracts.md
│   ├── client-api.md
│   └── repository-api.md
└── tasks.md               # Phase 2 output (/speckit-tasks — NOT created by this command)
```

### Source Code (repository root) — additions/changes only

```text
prisma/
└── schema.prisma                                    # MODIFIED: User + 11 new models

middleware.ts                                          # NEW — page-level auth-gate redirect (research.md Decision 12)

src/
├── server/
│   ├── auth/
│   │   ├── getCurrentUser.ts                         # MODIFIED — interim DEV_USER_ID body replaced with real session validation; signature unchanged
│   │   └── assertSystemPermission.ts                 # NEW
│   ├── security/
│   │   ├── passwordHash.ts                            # NEW — node:crypto scrypt wrapper
│   │   ├── secretToken.ts                              # NEW — node:crypto random-token + hash-at-rest helper, shared by sessions/reset-tokens/API-key secrets
│   │   └── encryption.ts                                # NEW — AES-256-GCM wrapper for SystemSettings.smtpPasswordEncrypted
│   └── repositories/
│       ├── authRepository.ts                           # NEW
│       ├── userManagementRepository.ts                  # NEW
│       ├── roleRepository.ts                             # NEW
│       ├── permissionRepository.ts                        # NEW
│       ├── securityAuditRepository.ts                       # NEW
│       ├── securitySettingsRepository.ts                     # NEW
│       ├── apiKeyRepository.ts                                # NEW
│       ├── systemSettingsRepository.ts                          # NEW
│       ├── backupRepository.ts                                  # NEW
│       └── monitoringRepository.ts                                # NEW
│
├── app/api/
│   ├── auth/{register,login,logout,session}/route.ts    # NEW
│   ├── auth/password-reset/{request,confirm}/route.ts    # NEW
│   ├── users/me/route.ts                                   # NEW
│   ├── admin/users/route.ts                                  # NEW
│   ├── admin/users/[userId]/route.ts                           # NEW
│   ├── admin/roles/route.ts                                      # NEW
│   ├── admin/roles/[roleId]/route.ts                               # NEW
│   ├── admin/permission-groups/route.ts                              # NEW
│   ├── admin/permissions/projects/[projectId]/route.ts                 # NEW
│   ├── admin/permissions/projects/[projectId]/members/[userId]/route.ts  # NEW
│   ├── admin/permissions/dashboards/[dashboardId]/shares/[userId]/route.ts # NEW
│   ├── admin/permissions/default-policy/route.ts                          # NEW
│   ├── admin/audit-log/route.ts                                              # NEW
│   ├── admin/audit-log/export/route.ts                                        # NEW
│   ├── admin/security-settings/route.ts                                        # NEW
│   ├── api-keys/route.ts                                                        # NEW
│   ├── api-keys/[keyId]/{rotate,usage}/route.ts                                   # NEW
│   ├── api-keys/[keyId]/route.ts                                                    # NEW
│   ├── admin/system-settings/route.ts                                                # NEW
│   ├── admin/system-settings/test-email/route.ts                                       # NEW
│   ├── projects/[projectId]/backups/route.ts                                             # NEW
│   ├── backups/[backupId]/{download,restore}/route.ts                                      # NEW
│   ├── backups/scheduled/run-due/route.ts                                                    # NEW
│   ├── admin/monitoring/overview/route.ts                                                      # NEW
│   └── health/route.ts                                                                           # NEW
│
├── shared/
│   ├── contracts/
│   │   ├── auth.schema.ts                              # NEW
│   │   ├── userManagement.schema.ts                     # NEW
│   │   ├── role.schema.ts                                # NEW
│   │   ├── securitySettings.schema.ts                     # NEW
│   │   ├── apiKey.schema.ts                                # NEW
│   │   ├── systemSettings.schema.ts                          # NEW
│   │   └── backup.schema.ts                                    # NEW
│   └── errors/apiError.ts                                        # MODIFIED: + ForbiddenError/FORBIDDEN (research.md Decision 7, if not already added by 006/007/008)
│
├── features/auth/                                                  # NEW module
│   ├── components/  # LoginForm, RegisterForm, PasswordResetRequestForm, PasswordResetConfirmForm, UserMenu
│   ├── hooks/useAuth.ts
│   ├── services/{authService.ts,queryKeys.ts}
│   ├── store/authStore.ts
│   ├── types/auth.types.ts
│   └── index.ts
│
└── features/admin/                                                   # NEW module
    ├── components/  # ~30 components — see contracts/client-api.md's tree
    ├── hooks/       # 9 hook files
    ├── services/    # 9 service files + queryKeys.ts
    ├── store/adminStore.ts
    ├── types/admin.types.ts
    └── index.ts

src/features/dashboard/components/Navbar.tsx                          # MODIFIED: mounts <UserMenu /> (one small, existing-shell touch, mirroring 008's one nav-link addition to the same singular app-shell module)
```

**Structure Decision**: Two new client feature modules
(`src/features/auth/`, `src/features/admin/`) rather than one — signing
in and administering the platform are distinct concerns with different
audiences (every user vs. administrators only), matching the same
separation-of-concerns reasoning 007/008 already applied elsewhere (e.g.,
007's `analysisStore`/`analysisPanelStore` split). Server-side, nine new
repository files, one new `middleware.ts`, and ~35 new Route Handler
files. The existing `src/server/auth/getCurrentUser.ts` is the **one**
existing file whose *implementation* changes — its signature does not,
so no caller anywhere in the codebase needs to change.

---

## Architecture

### User management

`userManagementRepository.ts` owns admin-facing `User` operations (list/
search/update/soft-delete), reusing the already-existing `getUserById`
from `userRepository.ts` unchanged rather than duplicating it.
`authRepository.ts` owns everything credential/session-related
(`UserCredential`, `Session`) as a distinct concern — user *identity
data* (name, email) vs. user *authentication material* are different
lifecycles, mirroring `Feature`/`FeatureStyle`'s existing one-to-one
split precedent (003) for the same reason: the base entity other
features already reference should change as rarely as possible.

### RBAC (Role-Based Access Control)

`SystemRole` + `PermissionGroup` + the join table (`roleRepository.ts`)
implement the platform-wide role system (research.md Decision 5).
`assertSystemPermission(userId, permissionGroupKey)` (a new file,
`src/server/auth/assertSystemPermission.ts`) is the single authorization
gate every administrative Route Handler calls, in the exact position
006-collaboration's `assertProjectRole` occupies for project-scoped
endpoints — two independent, non-overlapping authorization gates for two
independent, non-overlapping role systems.

### Permission model

Three layers, each already-established or newly-added for exactly the
gap the others don't cover: (1) **System role** — can this user access
administrative capability X at all (this feature, `assertSystemPermission`);
(2) **Project role** — what can this user do inside a specific project
(006, `assertProjectRole`, unchanged); (3) **Dashboard share** — a
narrower, per-dashboard override on top of (2) (008,
`resolveEffectivePermission`, unchanged). `permissionRepository.ts`
(this feature) is purely a read/write *composition* layer over (2) and
(3) for administrative oversight — it introduces no fourth permission
mechanism.

### Session management

`Session` rows (data-model.md), issued/validated/deleted by
`authRepository.ts`, read on every request by the rewritten
`getCurrentUser.ts` (parses the session cookie, calls `validateSession`,
throws `UnauthorizedError` — identical error type and Route-Handler-level
handling every existing feature already expects from this function).
`middleware.ts` performs the page-level pre-check/redirect (research.md
Decision 12) but never substitutes for `getCurrentUser`'s own,
independent check inside each Route Handler.

### API key architecture

A `Bearer`-token authentication path, entirely parallel to the
cookie-session path — `getCurrentUser` (or a sibling resolver used by
API-key-eligible endpoints) checks for an `Authorization: Bearer <secret>`
header first, falling back to the session cookie, so both authentication
methods resolve to the same `User`-typed return value every existing
Route Handler already expects. Scope is enforced by `apiKeyRepository.
validateApiKeyRequest`'s live re-intersection against the owner's current
role (research.md Decision 9) — never a stale snapshot.

### Audit logging

`securityAuditRepository.ts` owns `SecurityAuditLog`, written
transactionally by every administrative mutation (research.md Decision
10). The platform-wide Audit Log read path merges `SecurityAuditLog` and
006's `Activity` at query time — two source tables, one presented view,
zero duplicated storage.

### Security policies

`SecuritySettings` (singleton, `securitySettingsRepository.ts`) is read
live by: password-policy validation (Zod refinement fed by the current
settings, not a hardcoded rule), session-issuance (`expiresAt`
computation), the rate limiter (bucket thresholds), and
`assertIpAllowed` (a new, small check positioned first in the
authentication chain for every Route Handler, research.md Decision 11).

### Backup strategy

`backupRepository.ts` assembles a `Backup`'s content by calling existing
repositories (`layerRepository`, `featureRepository`, `dashboardRepository`,
`widgetRepository`) directly — server-side, not through any client
service — and stores the result as `Bytes` (research.md Decision 15),
reusing 008's `Report` precedent for both the storage choice and the
scheduled-trigger pattern (`POST /api/backups/scheduled/run-due`,
research.md Decision 16, reusing 008's `CRON_SECRET` convention).

### Monitoring / health checks

`GET /api/health` (unauthenticated, one cheap query) satisfies standard
platform health-check conventions. `monitoringRepository.
getMonitoringOverview` extends 008's `dashboardAnalyticsRepository`
compute-if-stale caching pattern platform-wide (research.md Decision 17)
rather than introducing a new caching mechanism.

---

## Database Changes

See data-model.md in full. Summary: `User` widened with `systemRoleId`
(required FK, add-nullable→backfill→tighten), `isActive`, `deletedAt`.
Eleven new tables created in one migration. 006's `Activity` and every
other prior feature's model is untouched. Seed data: four built-in
`SystemRole`s, the full `PermissionGroup` catalog and their role
assignments, singleton `SecuritySettings`/`SystemSettings` rows with
documented defaults, and the bootstrap Admin account (research.md
Decision 18).

## Performance

- **Session validation on every request**: `validateSession` is one
  indexed lookup (`@@unique([tokenHash])`) plus a join to `User` — no
  meaningfully different cost than any other per-request auth check
  already performed today.
- **`Session.lastActivityAt` write-throttling**: updating this column on
  literally every request would double write load platform-wide;
  instead it is updated at most once per a short interval (e.g., once
  per minute of actual activity) — sufficient granularity for a
  minutes-scale inactivity timeout (FR-004) without a write-per-request
  cost.
- **User search at 10,000+ scale (SC-005)**: `@@index([isActive])` plus
  a case-insensitive `ILIKE`/trigram-friendly search on `email`/`name`
  (a Postgres `pg_trgm` index is a candidate if a plain `ILIKE` scan
  proves too slow at real scale — flagged as a tuning decision for
  `/speckit-tasks`, not assumed necessary upfront).
- **Audit log at scale**: cursor-paginated, `@@index([createdAt])`/
  `@@index([category, createdAt])` — never a full-table load, per spec
  Edge Cases' explicit requirement.
- **Rate limiting**: reuses the existing in-memory limiter verbatim — no
  new performance characteristic, carrying forward its already-documented
  single-instance limitation (Risks below).
- **Backup generation**: for a large project, assembling a full backup
  (all layers/features/dashboards) server-side is the heaviest operation
  this feature introduces — chunked/streamed assembly (mirroring 007's
  chunked-execution pattern for large analysis operations) is the
  implementation approach for `backupRepository.createBackup`, not one
  giant in-memory object construction.

## Security

*This feature's entire purpose is Security — the items below are its own
mechanisms, not a checklist applied on top of something else.*

- **Ownership**: `Session`/`ApiKey`/`UserCredential` are strictly
  owned by exactly one `User`; every operation on them is scoped to
  `userId` (self-service) or gated by `manage_api_keys`/`manage_users`
  (administrative override) — never a bare id lookup with no ownership
  check.
- **Role permissions**: `assertSystemPermission` (this feature) and
  `assertProjectRole` (006) are independent, both enforced server-side,
  never trusted from client state (Constitution Principle VI).
- **Read-only/last-Admin protection**: every `User`-mutating function in
  `userManagementRepository.ts` checks the FR-010 invariant before
  committing, not merely at the UI layer.
- **Secrets at rest**: session tokens, password-reset tokens, and API
  key secrets are stored **hashed** (never plaintext, never reversible);
  SMTP passwords are stored **encrypted** (reversible, since the
  application itself must use it to send email) via AES-256-GCM keyed
  by the server-only `ADMIN_SECRETS_ENCRYPTION_KEY` (research.md
  Decision 14). Neither is ever included in a JSON response or a log
  line.
- **Audit logging**: every administrative mutation, every sign-in
  attempt (success or failure), and every security-setting change is
  recorded (FR-017/FR-024) — this feature is, among other things, the
  source of the audit trail every other security control depends on
  being trustworthy.
- **Rate limiting**: new `"auth:signin"`/`"auth:password-reset"`/
  `"admin:write"` buckets on the existing limiter, thresholds sourced
  live from `SecuritySettings`.
- **IP restrictions and break-glass recovery**: `assertIpAllowed` checks
  `SecuritySettings.ipAllowList`/`ipDenyList` before authentication runs.
  A documented **break-glass recovery path** (spec Edge Cases) exists for
  the case where an administrator misconfigures the list and locks
  themselves out: a server-only environment variable,
  `IP_RESTRICTION_BYPASS_TOKEN` (unset by default), which, if set and
  presented via a dedicated request header, causes `assertIpAllowed` to
  skip its check entirely. Setting this variable requires direct access
  to the deployment's environment configuration — already a trusted
  operator action, not something reachable through the application
  itself — so it cannot be triggered by any in-app action, only by
  whoever operates the deployment.
- **Input validation**: every request Zod-validated before any
  repository call, including password-policy enforcement sourced from
  live `SecuritySettings`, not a hardcoded rule.

## Testing Strategy

| Tier | Coverage |
|---|---|
| **Repository** | Every function in contracts/repository-api.md across all nine new repository files — success, not-found, forbidden, and (for `userManagementRepository`) every angle of the last-Admin-protection invariant, against the real PostGIS test database |
| **Route Handler (API)** | Every endpoint in api-contracts.md: success, validation failure, `401`, `403`, `404`, `409`, `429`; the `run-due` endpoint's shared-secret auth; `/api/health`'s unauthenticated success path |
| **Authentication flow** | A dedicated tier: register→login→session-validated-on-request→logout→session-invalid; password-reset request→email-sent (mocked transport)→confirm→old-password-rejected→all-sessions-invalidated; remember-me duration vs. non-persistent session-end behavior |
| **Service** | `authService`/`userManagementService`/etc.'s request-shaping (mocked `apiFetch`) |
| **Hook** | `useSession`'s cache behavior across login/logout; every mutation hook's cache-invalidation targets, especially `useLogout`'s full-cache-clear |
| **Store** | `authStore`/`adminStore` actions/selectors |
| **Integration** | One full run-through per user story matching quickstart.md's ten sections |
| **Accessibility** | Every admin panel and auth form against WCAG 2.2 AA (axe + RTL a11y assertions) — password fields, secret-reveal-once dialogs, and multi-step reset flows specifically checked for keyboard/screen-reader usability |
| **Performance** | User search at a seeded 10,000+-row scale (SC-005); audit-log pagination at a large seeded row count; backup generation timing for a large seeded project |
| **Data integrity** | A dedicated tier for `restoreProject`: a deliberately corrupted/truncated backup file must leave the target project provably byte-for-byte unchanged (not just "no error thrown") |

## Deployment Notes

| Target | Notes |
|---|---|
| **Vercel** | `POST /api/backups/scheduled/run-due` triggered via Vercel Cron (reusing 008's exact configuration pattern and, where convenient, the same `CRON_SECRET` value). `ADMIN_SECRETS_ENCRYPTION_KEY` and `IP_RESTRICTION_BYPASS_TOKEN` configured as server-only Vercel environment variables. |
| **Railway** | Railway Cron triggers the same endpoint; same environment variables via Railway's config. |
| **Docker** | Host-level `cron`/`systemd` timer triggers the endpoint; environment variables via `docker-compose.yml`/deployment secrets. |
| **AWS** | EventBridge Scheduler triggers the endpoint; environment variables via the hosting environment's standard secret configuration (Parameter Store/Secrets Manager feeding standard env vars — not a code-level integration with either service). |
| **Supabase** | Supabase Postgres hosts every new table identically to every existing one — no Supabase-specific schema concern; `pg_cron` (if enabled) or an external scheduler triggers the endpoint. |

Two new environment variables: `ADMIN_SECRETS_ENCRYPTION_KEY` (required —
the application MUST fail to start without it once this feature is
deployed, since `SystemSettings.smtpPasswordEncrypted` cannot be safely
handled otherwise) and `IP_RESTRICTION_BYPASS_TOKEN` (optional, unset by
default). `CRON_SECRET` is reused from 008's precedent, not redefined.
SMTP configuration itself lives in `SystemSettings` (database-configured
by an administrator via the UI), **not** environment variables — this is
a deliberate choice (research.md Decision 8) so email configuration is
an in-app administrative action, not a deploy-time/redeploy-required
change.

## Risks

| Risk | Mitigation |
|---|---|
| The existing rate limiter is in-memory and single-process, a pre-existing, already-documented limitation this feature's new `"auth:signin"` bucket inherits — a brute-force attempt distributed across multiple deployed instances would not share rate-limit state | Documented explicitly as a carried-forward limitation, not silently ignored (research.md Decision 11); a future shared-store (Redis) upgrade is a platform-wide change out of this feature's scope, tracked here for visibility, not solved now |
| A very large project's backup generation could be slow/memory-heavy | Chunked/streamed assembly (Performance section), mirroring 007's established chunked-execution pattern for large operations |
| SMTP misconfiguration silently breaking password reset for all users | The mandatory "send test email" action (FR-032) before relying on new SMTP settings; a failed password-reset email send is logged as a `SecurityAuditLog` `"security_event"` `errorMessage`, visible to an administrator, not silently swallowed |
| An administrator locking themselves out via IP restrictions | The documented break-glass `IP_RESTRICTION_BYPASS_TOKEN` path (Security section) |
| Restore correctness — a failed/corrupted restore partially overwriting a project | Single-transaction `restoreProject` (data-model.md), rolling back entirely on any failure; a dedicated data-integrity test tier (Testing Strategy) verifies this explicitly, not just via code review |
| The bootstrap-Admin mechanism being misused or forgotten in a production deploy, leaving the platform with no administrator | Explicitly documented, single, auditable bootstrap path (research.md Decision 18) rather than an implicit rule; the last-Admin-protection invariant (FR-010) additionally guarantees this state can never be reached *after* the bootstrap Admin exists |
| Session-hijacking via a stolen `tokenHash`-matching cookie value | Cookie is `httpOnly`/`Secure`/`SameSite=Lax` (Decision 1), meaning it is never readable by client-side JavaScript (mitigating XSS-based theft) and not sent cross-site (mitigating CSRF for state-changing requests, alongside this codebase's existing `SameSite` default posture) |

---

## Development Phases (for `/speckit-tasks`)

**Phase 1 — Setup**: Twelve-model schema change + migration;
`node:crypto`-based `passwordHash.ts`/`secretToken.ts`/`encryption.ts`;
`nodemailer` dependency; all seven new Zod contract file shells;
`auth`/`admin` module scaffolds.

**Phase 2 — Foundational**: `authRepository.ts`; rewritten
`getCurrentUser.ts` (session validation, signature preserved);
`assertSystemPermission.ts`; `middleware.ts`; `roleRepository.ts` +
seeded built-in roles/permission groups; bootstrap-Admin seed path;
`FORBIDDEN`/`ForbiddenError` addition (if not already present).

**Phase 3 — Authentication (US1)**: `/api/auth/*` endpoints;
`authService.ts`/`useAuth.ts`; `LoginForm`/`PasswordResetRequestForm`/
`PasswordResetConfirmForm`/`UserMenu`.

**Phase 4 — User Management (US2)**: `userManagementRepository.ts`;
`/api/admin/users/*` + `/api/users/me`; `UserManagementPanel` + profile
editor.

**Phase 5 — Role Management (US3)**: `/api/admin/roles/*` +
`/api/admin/permission-groups`; `RoleManagementPanel`.

**Phase 6 — Permission Management (US4)**: `permissionRepository.ts`
(reusing 006/008); `/api/admin/permissions/*`; `PermissionManagementPanel`.

**Phase 7 — Audit Logs (US5)**: `securityAuditRepository.ts` (and its
transactional write wired into every prior phase's mutations, back-filled
as each lands); `/api/admin/audit-log*`; `AuditLogPanel`.

**Phase 8 — Security Settings (US6)**: `securitySettingsRepository.ts`;
`assertIpAllowed`; `/api/admin/security-settings`; `SecuritySettingsPanel`.

**Phase 9 — API Key Management (US7)**: `apiKeyRepository.ts`; the
Bearer-token resolution path in `getCurrentUser`; `/api/api-keys/*`;
`ApiKeyManagementPanel`.

**Phase 10 — System Settings (US8)**: `systemSettingsRepository.ts`
(incl. `nodemailer` wiring); `/api/admin/system-settings*`;
`SystemSettingsPanel`.

**Phase 11 — Backup & Restore (US9)**: `backupRepository.ts`;
`/api/projects/:projectId/backups*`, `/api/backups/*`;
`BackupRestorePanel`.

**Phase 12 — Monitoring (US10)**: `monitoringRepository.ts`;
`/api/health`, `/api/admin/monitoring/overview`; `MonitoringDashboard`.

**Phase 13 — Testing & Polish**: full test-tier pass (Testing Strategy
above); accessibility audit; quickstart.md full run-through; Constitution
Check re-verification.

Phases 1–2 block everything (real authentication must exist before any
administrative feature is meaningfully gated). Phase 3 (Authentication)
must land before Phases 4–12 are usable end-to-end, though each of
Phases 4–12's *server-side* work can be built in parallel once Phase 2's
`assertSystemPermission` exists. Phase 7 (Audit Logs) has a soft
dependency on every other phase for something to log, but its own
repository/endpoint work is independent and can land early, with its
transactional write calls added incrementally as each other phase's
mutations are built.

---

## Quality Gates

- **TypeScript**: `tsc --noEmit` — zero errors
- **ESLint**: `eslint src --max-warnings 0` — zero errors/warnings
- **Vitest**: all applicable tiers above passing
- **Production build**: `next build` succeeds
- **Bundle analyzer**: confirms `nodemailer` (server-only) contributes
  zero bytes to any client bundle (Constitution Principle V)
- **Secret-handling audit**: manual confirmation that no session token,
  password, password-reset token, API key secret, or SMTP credential
  ever appears in a JSON response, a log line, or a test fixture
  committed to the repository

---

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Item | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `permissionRepository.ts` (US4) calls 006-collaboration's and 008's repository functions directly, which do not yet exist in code (both are still specs/plans) | Spec FR-014 requires this feature's Permission Management view to reflect the platform's *real* project-role and dashboard-share data, which only exist once 006/008 are implemented — reusing their functions is the entire point (avoiding a duplicate permission engine, research.md's core theme across 007/008/009) | Building Permission Management's own parallel project-role/dashboard-share storage (rejected — directly contradicts "reuse existing architecture" and would need reconciliation with 006/008 the moment either lands, exactly the failure mode 007/008's own plans already avoided for analogous cases) — this dependency is sequencing, not a design flaw, and Permission Management (US4, P2) can be built/deployed after Authentication/User/Role Management (P1) even if 006/008 land later |
| One new npm dependency (`nodemailer`) | Password reset (US1) and admin-configured email (US8) require outbound email, a capability this codebase has never needed before this feature | Omitting real email delivery, showing reset links only in-app (rejected — insecure for a real multi-user platform and explicitly what US1/US8 ask for; also makes the platform's very first real authentication system meaningfully less safe than the interim placeholder it replaces) |
| Two new server-only environment variables (`ADMIN_SECRETS_ENCRYPTION_KEY`, `IP_RESTRICTION_BYPASS_TOKEN`) | Encrypting SMTP credentials at rest (Constitution Principle VI) requires a server-held key not derivable from anything already in the environment; the break-glass IP-lockout recovery path (spec Edge Cases) requires an out-of-band mechanism outside the application's own database (since the database itself is what an IP-locked-out administrator cannot otherwise reach a UI to fix) | Deriving the encryption key from an existing secret (e.g., `DATABASE_URL`) (rejected — conflates two unrelated secrets' rotation lifecycles, weakening both); no break-glass mechanism at all (rejected — spec Edge Cases explicitly requires a recovery path, and "manually edit the database" is not a documented, operator-friendly one) |
