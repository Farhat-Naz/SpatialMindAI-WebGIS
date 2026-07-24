# Research: Administration & Security (009)

**Input**: `specs/009-administration-security/spec.md`

**Context**: This is the first feature in this codebase to implement real
authentication. `src/server/auth/getCurrentUser.ts` is an explicitly
documented interim placeholder resolving every request to one seeded
`DEV_USER_ID` — no password, session, cookie, or login mechanism exists
anywhere. No crypto/auth/email/RBAC library is present in `package.json`.
`FORBIDDEN`/`ForbiddenError` (referenced as "already added" by 006/007/008's
plans) does **not** yet exist in `src/shared/errors/apiError.ts`, because
006, 007, and 008 are all still specs/plans — no code from any of them has
been implemented yet. 006-collaboration's `Activity` model is scoped to a
required, non-nullable `projectId`, so it structurally cannot hold
platform-wide events (a sign-in, a user being deactivated) that have no
project context. Every decision below accounts for these facts as they
actually stand in the codebase today, not as later plans assumed.

---

## Decision 1: Session mechanism — DB-backed opaque session tokens in an httpOnly cookie, not JWT

**Decision**: Sign-in issues a random, high-entropy session token
(`crypto.randomBytes`, Node's built-in `node:crypto`), stores its **hash**
(never the raw token) in a new `Session` row, and sets it in an
`httpOnly`, `Secure`, `SameSite=Lax` cookie. Every request re-validates the
cookie's token against the `Session` table (hash comparison), checking
expiry and the owning user's active status on every read — not just at
issue time.

**Rationale**: The spec requires immediate session invalidation on
sign-out (FR-004) and on deactivation (spec Edge Cases: "their session is
invalidated on their next request, not just blocked from a future
sign-in") — a stateless JWT cannot satisfy this without a revocation
list, which is itself a database table, at which point a DB-backed
session is the simpler, more direct design already. A DB-backed session
also naturally supports "remember me" (FR-003, via the row's
`expiresAt`), and requires no new cryptographic library — `node:crypto`
is already part of the Node.js runtime this application already targets.

**Alternatives considered**: Stateless JWT (rejected — cannot be
immediately revoked without a second stateful revocation-list table,
which defeats the purpose of choosing stateless in the first place, and
this codebase has no existing JWT-signing dependency to reuse); a
third-party session/auth library (e.g., NextAuth/Auth.js) (rejected — see
Decision 2).

---

## Decision 2: No third-party auth framework — hand-rolled, using only `node:crypto` and Prisma

**Decision**: Authentication (password hashing, session issuance/
validation, password reset) is implemented directly against the existing
`User`/new `Session` models via Prisma and Node's built-in `node:crypto`
module — no NextAuth/Auth.js, Clerk, or similar framework is introduced.

**Rationale**: This codebase's established pattern (003–008) is
consistently "prefer the smallest addition that satisfies the
requirement over adopting a framework," and every requirement in US1
(login, reset, remember-me, session timeout, sign-out) is directly
achievable with Prisma + `node:crypto`, which this project already fully
depends on. A third-party auth framework would also come with its own
session/cookie/provider abstractions that would need to be reconciled
with `getCurrentUser`'s existing, already-adopted-by-every-other-feature
signature (`(request: Request) => Promise<User>`), for no capability
gain the requirements actually need. This keeps the one auth seam every
other feature already depends on stable — no other feature's Route
Handler, repository, or authorization check needs to change (per
spec.md's explicit constraint, FR-001).

**Alternatives considered**: NextAuth/Auth.js (rejected — its session/JWT
abstractions don't map cleanly onto the existing `getCurrentUser` seam
without an adapter layer, and it pulls in OAuth-provider machinery this
spec's email/password-only US1 doesn't need); Clerk/Auth0 (rejected —
external hosted-auth dependency, a new environment-variable/vendor
dependency this codebase has consistently avoided per 007/008's research,
and a hosted provider is a heavier commitment than this phase's
requirements justify).

---

## Decision 3: Password hashing — Node's built-in `scrypt`, not a new dependency

**Decision**: Passwords are hashed with `node:crypto`'s built-in
`scrypt` (via `crypto.scryptSync`/`scrypt` with a per-password random
salt, OWASP-recommended parameters), stored as `salt:hash` in the new
`UserCredential.passwordHash` field.

**Rationale**: `scrypt` is an OWASP-approved, memory-hard password
hashing algorithm built into Node.js core — zero new npm dependency,
zero native-binding/serverless-portability risk (unlike `bcrypt`'s
native compiled addon, which has historically caused friction on some
serverless build targets). This keeps the "zero new dependency for
core auth" story consistent with Decision 2.

**Alternatives considered**: `bcrypt` (rejected — native bindings can
fail to build/run identically across all five deployment targets this
platform must support, per 007/008's established portability
requirement; `bcryptjs`, the pure-JS alternative, would still be a new
dependency `node:crypto`'s built-in `scrypt` makes unnecessary);
`argon2` (rejected — same native-binding/new-dependency concern, and
`scrypt`'s built-in availability makes it the lower-footprint choice
for this codebase specifically, even though `argon2` is a reasonable
choice in a codebase without Node's `scrypt` already at hand).

---

## Decision 4: Password reset tokens — same `node:crypto` random-token + hash-at-rest pattern as sessions

**Decision**: A password-reset request generates a random token
(`crypto.randomBytes`), stores only its hash plus an expiry on the
`UserCredential` row, and emails the raw token (Decision 8) as a link.
The token is single-use (cleared/invalidated the moment it's consumed)
and time-limited (a short, configurable expiry).

**Rationale**: Identical cryptographic pattern to Decision 1's session
tokens — one consistent "generate random, store hash, compare hash"
idiom used everywhere a secret token appears in this feature (sessions,
password resets, API keys — Decision 9), rather than three different
patterns.

**Alternatives considered**: A short numeric OTP code instead of a link
token (rejected — spec.md explicitly allows either "a reset link/code";
a link is simpler to implement securely with the same token pattern
already chosen, and no specific UX requirement favors a numeric code).

---

## Decision 5: RBAC data model — a `SystemRole` table (built-in + custom rows) with `PermissionGroup` many-to-many, distinct from Collaboration's project roles

**Decision**: Platform-wide roles are a `SystemRole` table — four seeded,
non-deletable built-in rows (Admin/Manager/Editor/Viewer,
`isBuiltIn: true`) plus any number of administrator-created custom rows.
Each `SystemRole` has a many-to-many relationship (via a
`SystemRolePermissionGroup` join table) to `PermissionGroup` — a small,
seeded catalog of named capabilities (`manage_users`, `manage_roles`,
`view_audit_logs`, `manage_security_settings`, `manage_api_keys`,
`manage_system_settings`, `manage_backups`, `view_monitoring`, one entry
per distinct administrative capability this spec defines). `User` gains a
required `systemRoleId` FK.

**Rationale**: Directly satisfies FR-011 (four built-in roles), FR-012
(custom roles from permission groups), and FR-013 (block deleting a role
in use, enforced via the FK's `Restrict` behavior plus an explicit
pre-check for a clear error message rather than a raw constraint
violation). Naming this `SystemRole` (not `Role`) and keeping it entirely
separate from 006-collaboration's `ProjectMember.role` enum avoids any
schema-level or naming collision with the already-designed project-role
concept, exactly matching spec.md's own resolved Assumption that these
are deliberately distinct mechanisms.

**Alternatives considered**: A fixed enum (`ADMIN | MANAGER | EDITOR |
VIEWER`) with no custom-role support (rejected — does not satisfy
FR-012's explicit custom-role requirement); reusing/extending
`ProjectMember.role` for platform-wide roles (rejected — conflates two
genuinely different scopes, project-level vs. platform-level, which
spec.md's Assumptions explicitly resolved as separate).

---

## Decision 6: Authorization helper — `assertSystemPermission`, following `assertProjectRole`'s exact shape

**Decision**: One new function, `assertSystemPermission(userId,
permissionGroupKey)`, checks whether the user's `SystemRole` includes the
given `PermissionGroup` (via the join table), throwing `ForbiddenError`
if not — called at the top of every administrative Route Handler, in the
same position 006-collaboration's `assertProjectRole` already occupies
for project-scoped endpoints.

**Rationale**: Reuses the exact `getCurrentUser` → `assert*` →
rate-limit → validate → repository → `handleRouteError` shape every
endpoint in this codebase already follows, rather than inventing a
differently-shaped authorization check for administrative endpoints.

**Alternatives considered**: Middleware-only authorization (rejected as
the *sole* mechanism — Next.js Middleware runs before a Route Handler and
is used for a first-pass page-level redirect, Decision 12, but every
Route Handler still independently re-checks per Constitution Principle
VI's "auth MUST be enforced on every protected Route Handler," never
trusting middleware alone).

---

## Decision 7: `FORBIDDEN`/`ForbiddenError` — added here since no prior feature has actually implemented it yet

**Decision**: This plan adds `403 FORBIDDEN`/`ForbiddenError` to
`src/shared/errors/apiError.ts` (the same addition 006/007/008's plans
already anticipated, but none has actually been implemented in code yet).
If 006, 007, or 008 lands first and adds it, this feature's
implementation is a no-op confirmation instead of a fresh addition —
documented explicitly so whichever feature implements first doesn't
duplicate the other's work.

**Rationale**: `assertSystemPermission`/`assertProjectRole`-style checks
need a `403` outcome distinct from the existing `401 UNAUTHORIZED`
("no resolvable user at all") — `403` means "resolved, but not permitted"
— and this shared addition was already correctly identified by three
prior plans; it simply hadn't been built yet because none of them has
been implemented.

**Alternatives considered**: Reusing `UNAUTHORIZED` for a permission
failure (rejected — conflates "who are you" with "you're known, but not
allowed," which the spec's own FR-040 and every prior plan's Security
section already treats as distinct).

---

## Decision 8: Outbound email — `nodemailer` over SMTP, provider-agnostic and administrator-configured

**Decision**: One new dependency, `nodemailer`, sends password-reset
links and test emails via SMTP, using connection settings an
administrator configures in System Settings (US8 — host, port,
credentials, from-address) and are stored via `SystemSettings`
(Decision 13), with the SMTP password encrypted at rest (Decision 14).

**Rationale**: `nodemailer`'s SMTP transport works with any provider
(Gmail, SES, SendGrid, Postmark, a self-hosted mail server) without a
vendor-specific SDK, matching spec.md's own framing of "Email settings"
as an administrator-configurable outbound provider rather than a single
hardcoded vendor integration. This is the smallest, most portable choice
that satisfies FR-032's "test email" and US1's password-reset delivery
requirement — no application code before this feature has needed to send
email at all, so this is a genuinely new, justified capability, not a
duplicated one.

**Alternatives considered**: A specific vendor SDK (Resend, SendGrid)
(rejected — locks the platform to one vendor and contradicts the spec's
"administrator configures email settings" framing, which implies
provider flexibility); no email capability, reset-link-shown-in-UI-only
(rejected — insecure and impractical for a real multi-user platform;
explicitly what US1/US8 ask for).

---

## Decision 9: API keys — same random-token + hash-at-rest pattern, capped at owner's live permissions, checked at request time

**Decision**: An `ApiKey` row stores a hash of its secret (never the raw
value, shown once at creation, Decision 4's pattern reused a third time),
its `scope` (a subset of the owning user's available permission groups,
validated not to exceed them at creation *and* re-checked at every use —
FR-026), `expiresAt`, and rotation metadata (`rotatedFromKeyId`
self-relation preserving usage history across a rotation). A
`Bearer`-token Route Handler middleware path resolves an API key request
to its owning `User` + effective scope, entirely parallel to (not
replacing) the cookie-session path Decision 1 established.

**Rationale**: Directly satisfies FR-025–028; re-checking scope against
the *current* owning user's permissions on every request (not just at
key-creation time) satisfies spec.md's Edge Case ("the key's effective
access is always capped at the current permissions of its owning user,
checked at request time, not just at key-creation time") without
requiring key regeneration whenever a user's role changes.

**Alternatives considered**: A capability snapshot frozen at key-creation
time (rejected — explicitly the edge case spec.md resolves against: a
downgraded user's still-active key must not retain elevated access).

---

## Decision 10: Audit logging — a new `SecurityAuditLog` table for platform-wide events, `Activity` (006) reused unchanged for project-scoped events, merged only at the read/UI layer

**Decision**: A new `SecurityAuditLog` table records every event that has
no project context — login attempts (success/failure), user
create/deactivate/reactivate/delete, role/permission changes, security-
setting changes, API key lifecycle events. 006-collaboration's `Activity`
table (required `projectId`) is **not** modified and continues to be the
record of project-scoped actions. The platform-wide Audit Log view
(US5/FR-017–019) queries both tables and merges them chronologically for
display — FR-018's "without duplicating those entries into a second log"
means no `Activity` row is ever copied into `SecurityAuditLog` (and vice
versa), not that both must live in one physical table.

**Rationale**: `Activity.projectId` is a required, cascade-deleted
foreign key in the already-designed 006 schema — a sign-in attempt or a
platform-wide user deactivation has no project to attach to, so it
structurally cannot be an `Activity` row without altering 006's schema
(which "do not redesign existing architecture" rules out). A new,
narrowly-scoped table for exactly the events that don't fit is additive,
not duplicative — the same reasoning 007/008 already applied when a
concept didn't fit an existing table (e.g., 007's `MeasurementHistory`,
008's `Report`).

**Alternatives considered**: Making `Activity.projectId` nullable to
absorb platform-wide events too (rejected — modifies an already-approved
006 model's core constraint, contradicting "do not redesign existing
architecture"; also every existing `Activity` index/query assumes a
non-null `projectId`, so nullability would require touching 006's
already-designed indexes too); one shared polymorphic audit table across
the whole platform, replacing `Activity` (rejected — far larger scope
than this feature, rewriting 006's design).

---

## Decision 11: Security settings enforcement — extend the existing rate limiter and Route Handler chain in place; no new middleware framework

**Decision**: Password policy (FR-020) is enforced as a Zod refinement
checked against the live `SecuritySettings` row wherever a password is
set/reset. Session timeout (FR-021) is enforced by `Session.expiresAt`
being computed from the configured duration at issue time, re-validated
on every request (Decision 1). Rate limiting (FR-022) reuses the
existing `checkRateLimit`/`assertWriteRateLimit` mechanism verbatim, with
new buckets (`"auth:signin"`, `"auth:password-reset"`) whose thresholds
read from `SecuritySettings` instead of a hardcoded default — the same
in-memory, single-process limiter 004/005 already established, carrying
forward its already-documented multi-instance limitation (Risks below)
rather than solving it now. IP restriction (FR-023) is a new
`assertIpAllowed(request)` check, positioned first in the Route Handler
chain (before `getCurrentUser`), reading the client IP from the
platform-appropriate header (Deployment Notes) against `SecuritySettings`'
allow/deny list.

**Rationale**: Every mechanism reused here is already adopted somewhere
in this codebase; the only new code is reading live configuration
(`SecuritySettings`) into checks that already exist in shape, plus the
one genuinely new check (`assertIpAllowed`) this spec requires and no
prior feature needed.

**Alternatives considered**: A shared, cross-instance rate-limit store
(e.g., Redis) to fix the existing in-memory limitation while here
(rejected — out of this feature's scope; the limitation is a pre-existing,
already-documented one this feature does not make materially worse,
and fixing it is a platform-wide infrastructure change disproportionate
to this feature's own requirements — recorded in Risks, not silently
ignored).

---

## Decision 12: Page-level auth gating — Next.js Middleware for redirect-on-unauthenticated, Route Handlers remain the enforcement authority

**Decision**: A `middleware.ts` at the project root checks for a valid
session cookie (Decision 1) before rendering any authenticated page
route, redirecting to sign-in if absent/expired — the idiomatic Next.js
App Router mechanism for page-level gating. This is UX convenience only;
every Route Handler still independently calls `getCurrentUser` and
`assertSystemPermission`/`assertProjectRole` per Constitution Principle
VI, exactly as today — middleware is never the sole enforcement point.

**Rationale**: Matches Next.js's own recommended pattern for
authenticated-app page gating, while preserving this codebase's existing,
non-negotiable rule that authorization is enforced in the Route Handler,
not trusted from an earlier layer.

**Alternatives considered**: Per-page server-side checks with no
middleware (rejected — works but produces a worse UX, a flash of
protected content or a manual redirect in every single page component
instead of one central gate); relying on middleware alone for API
protection too (rejected outright by Constitution Principle VI).

---

## Decision 13: System settings — one `SystemSettings` singleton row, not a generic key-value table

**Decision**: `SystemSettings` is a single row (`id` fixed/well-known, or
enforced-singleton via a unique constraint on a constant discriminator)
holding every US8 setting (general, storage, map defaults, email SMTP
config, backup schedule) as typed columns, not a generic
`SystemSetting(key, value)` table.

**Rationale**: The full set of settings this spec defines is fixed and
known (US8's five categories) — a generic key-value table would trade
compile-time type safety (Constitution Principle II) for a flexibility
this spec doesn't ask for. Typed columns keep every setting Zod-validated
and TypeScript-typed end to end, consistent with every other entity in
this codebase.

**Alternatives considered**: A generic `key`/`value` settings table
(rejected — no type safety, and this spec's settings are a closed,
enumerable set, not an open-ended plugin-configuration surface).

---

## Decision 14: Secrets at rest — SMTP credentials and any stored secret are encrypted with a server-only key, never stored plaintext

**Decision**: `SystemSettings.smtpPassword` (and any other credential
this feature stores, e.g., a future MFA secret) is encrypted at rest
using Node's built-in `node:crypto` symmetric encryption (AES-256-GCM),
keyed by a new server-only environment variable
(`ADMIN_SECRETS_ENCRYPTION_KEY`), never logged, never exposed via any API
response.

**Rationale**: Constitution Principle VI requires secrets to be
server-side only and never exposed; storing an SMTP password (or any
credential) in plaintext in the database would violate that principle's
spirit even though it's technically "server-side." AES-256-GCM via
`node:crypto` requires no new dependency, consistent with Decisions 1/3's
"use the runtime's built-in crypto" theme.

**Alternatives considered**: Plaintext storage (rejected outright —
security anti-pattern); a dedicated secrets-manager service (AWS Secrets
Manager, Vercel-specific secret store) (rejected — ties the
implementation to one deployment target, contradicting the five-target
portability requirement every prior feature's plan has upheld).

---

## Decision 15: Backups are server-generated and server-stored (like 008's `Report`), reusing existing repository reads directly — not the client-side export pattern

**Decision**: A `Backup` is generated entirely server-side: a Route
Handler (for on-demand) or the scheduled `run-due` endpoint (Decision 16)
calls the existing repository layer directly — `layerRepository`,
`featureRepository`, `dashboardRepository`, `widgetRepository` (008),
etc. — to assemble a structured JSON+GeoJSON bundle (a manifest plus one
GeoJSON payload per layer plus dashboard/widget configuration), and
stores the resulting archive in a `fileContent Bytes` column on `Backup`,
directly reusing 008's `Report.fileContent` precedent (research.md
Decision 17 in 008) rather than introducing object storage.

**Rationale**: Unlike 007/008's ad-hoc *exports* (deliberately kept
client-side, no browser needed to be present, user-initiated and
immediate), a **scheduled** backup has no browser present when it runs —
the same structural reason 008's Reports had to be server-generated for
their scheduled path. Reusing repository functions directly (not the
client `services/*.ts` files, which depend on `apiFetch`/browser `fetch`)
is the correct server-side data-access path per Constitution Principle I.
Storing the result as `Bytes` reuses 008's already-justified,
portable, zero-new-infrastructure choice rather than introducing a
second storage decision for a structurally similar problem.

**Alternatives considered**: Streaming a backup directly to the requesting
client without server-side storage for on-demand backups, only
persisting scheduled ones (rejected — an inconsistent two-path design for
one entity; a single server-generated-and-stored path is simpler and
still satisfies "download it" for both origins); external object storage
for backup artifacts, given they may be larger than a typical report
(considered and reasonably justified by size, but rejected for this
phase to stay consistent with 008's precedent and avoid a second new
infrastructure decision — flagged explicitly in Risks as a likely future
upgrade point once real project sizes are observed in production).

---

## Decision 16: Scheduled backups — reuse 008's exact "external scheduler calls one idempotent endpoint" pattern

**Decision**: `POST /api/backups/scheduled/run-due` is authenticated via
the same `X-Cron-Secret`/`CRON_SECRET` shared-secret pattern 008's
`run-due` endpoint already established (reusing, not duplicating, the
environment variable and header convention) — finds every project whose
configured backup schedule (from `SystemSettings`/per-project override,
if any) is due, generates a `Backup` per project, and is safe to call
repeatedly.

**Rationale**: This is the second feature needing "run something on a
schedule with no user present," and 008 already designed the portable
answer (external platform-native scheduler → one idempotent endpoint) —
reusing the exact pattern (and, where the same `CRON_SECRET` value is
reused across both features, the same environment variable) avoids a
second scheduling mechanism for a structurally identical problem.

**Alternatives considered**: A separate scheduling mechanism specific to
backups (rejected — 008 already solved this exact class of problem;
introducing a second one is unjustified duplication).

---

## Decision 17: Monitoring/health — a lightweight `/api/health` endpoint plus reuse of existing repository counts; no APM/observability vendor integration

**Decision**: `GET /api/health` (no auth required, matching standard
load-balancer/platform health-check conventions) returns a basic
`{ status, database: "ok" | "error" }` by issuing one cheap query.
The authenticated Monitoring dashboard (US10) reuses 008's
`dashboardAnalyticsRepository`-style compute-if-stale-else-serve pattern
for storage/user-count aggregates (extended here to also cover
platform-wide, not just per-project, counts), and derives "system
performance" from already-logged data — `SecurityAuditLog`'s failed-
login/error entries and `ApiKeyUsageLog`'s recorded outcomes — rather
than integrating a dedicated APM/observability product.

**Rationale**: `/api/health` is the minimal, standard-shape endpoint
every one of the five deployment targets' health-check/uptime tooling
expects, with zero new dependency. Deriving "performance" signals from
data this feature already persists (rather than adding a metrics/tracing
vendor) keeps the monitoring surface proportionate to what US10 actually
asks for (a health dashboard, not a full observability platform) and
introduces no new external service dependency.

**Alternatives considered**: A dedicated APM/observability integration
(Sentry, Datadog, etc.) (rejected — explicitly disproportionate to a
"basic system-performance indicator" requirement, a new vendor
dependency and environment variables, and not requested by spec.md,
which frames monitoring as an in-app dashboard, not third-party tooling
integration).

---

## Decision 18: Bootstrap Admin — a seed-time or first-run environment-configured account, never an in-app "first user becomes Admin" implicit rule

**Decision**: The platform's first Admin account is established either
via `prisma/seed.ts` (development/test environments, matching every
existing seed-data convention) or, for a production deployment, via a
one-time, explicitly documented bootstrap step reading a configured
initial-admin email from an environment variable and creating that
account with the Admin `SystemRole` if no Admin exists yet — never an
implicit "the first person to sign up becomes Admin" rule, which would
be a silent, unauditable security behavior.

**Rationale**: Directly resolves spec.md's Edge Case (the bootstrap
problem) with an explicit, auditable mechanism rather than an implicit
one that could be exploited by racing to sign up first, or that
surprises an operator who didn't realize the first registrant becomes an
administrator.

**Alternatives considered**: Implicit first-user-is-Admin (rejected —
security-sensitive and non-obvious; an explicit, documented bootstrap
step is the standard, safer pattern for this exact problem).

---

## Summary of resolved unknowns

No `[NEEDS CLARIFICATION]` markers remain from the spec, and none were
introduced during planning. Exactly **one** new npm dependency is
introduced — `nodemailer` (Decision 8, the platform's first outbound-email
capability) — everything else (session tokens, password hashing,
encryption, RBAC, audit logging, API keys, backups) is built on
`node:crypto` and Prisma, already fully available in this codebase,
reusing 006's role/audit patterns and 007/008's already-established
precedents (job-status/scheduling, `Bytes`-column artifact storage,
compute-if-stale caching) wherever the same structural problem recurs.
