# Feature Specification: Administration & Security

**Feature Branch**: `009-administration-security`

**Created**: 2026-07-24

**Status**: Draft

**Input**: User description: "Add enterprise Administration & Security to
SpatialMindAI-WebGIS: user management (create/deactivate/activate/delete/
search users, profile management), role management (Admin/Manager/Editor/
Viewer platform roles, custom roles, permission groups), permission
management (project/layer/feature/dashboard/analysis/export permissions),
authentication (email login, password reset, MFA-ready, session
management, remember me), audit logs (login history, user/project
actions, security events, export logs), security settings (password
policy, session timeout, rate limiting, IP restrictions, API keys), API
key management (create/rotate/expire keys, scopes, usage logs), system
settings (general/storage/map-defaults/email/backup settings), backup &
restore (database/project backup, restore, export backup), and monitoring
(health dashboard, storage usage, user/API statistics, system
performance). Reuse existing architecture; do not redesign it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Authentication (Priority: P1)

A user signs in with their email and password to access the platform,
can reset a forgotten password, stays signed in across a browser
restart if they choose "remember me," and has their session managed
securely (timing out after inactivity, or explicitly signed out).

**Why this priority**: The platform currently has no real sign-in — every
other capability in this spec (and the platform's existing multi-user
features: Collaboration, Dashboard sharing) depends on being able to
identify who is actually making a request. This is the single most
foundational story in this specification.

**Independent Test**: Can be fully tested by signing up/in with an email
and password, signing out, and signing back in — independent of any
admin, role, or permission capability existing yet.

**Acceptance Scenarios**:

1. **Given** a registered user's correct email and password, **When**
   they submit the sign-in form, **Then** they are authenticated and
   land in the application with their identity established for every
   subsequent request.
2. **Given** an incorrect password, **When** the user submits the sign-in
   form, **Then** sign-in is rejected with a message that does not reveal
   whether the email itself is registered.
3. **Given** a user who has forgotten their password, **When** they
   request a password reset for their email, **Then** they receive a
   reset link/code that lets them set a new password, and their old
   password stops working once the new one is set.
4. **Given** a signed-in user, **When** they choose "remember me" at
   sign-in, **Then** their session persists across closing and reopening
   the browser, up to a bounded maximum duration; without it, the session
   ends when the browser session ends.
5. **Given** a signed-in user with no activity for longer than the
   configured session timeout, **When** they next interact with the
   application, **Then** they are required to sign in again.
6. **Given** a signed-in user, **When** they explicitly sign out, **Then**
   their session is invalidated immediately and cannot be reused.

---

### User Story 2 - User Management (Priority: P1)

An administrator creates new user accounts, searches/browses the full
user list, deactivates a user (blocking their access without deleting
their history), reactivates a previously deactivated user, and deletes a
user account when appropriate; any user manages their own profile.

**Why this priority**: Once real authentication (US1) exists, someone
must be able to provision and manage accounts — this is the next most
foundational capability, and every other administrative story in this
spec assumes a real, manageable user directory exists.

**Independent Test**: Can be fully tested by an administrator creating a
new user, searching for them, deactivating them, reactivating them, and
deleting them — independent of role/permission configuration.

**Acceptance Scenarios**:

1. **Given** an administrator, **When** they create a new user with an
   email and initial role, **Then** the account exists and that person
   can complete sign-in (e.g., via a password-setup link) using it.
2. **Given** a large user directory, **When** an administrator searches by
   name or email, **Then** matching users are returned quickly.
3. **Given** an active user, **When** an administrator deactivates them,
   **Then** that user can no longer sign in, but their historical
   data/attribution (projects owned, activity, comments) remains intact.
4. **Given** a deactivated user, **When** an administrator reactivates
   them, **Then** they can sign in again with their existing credentials.
5. **Given** a user account, **When** an administrator deletes it, **Then**
   the account can no longer sign in and is removed from the active user
   list, while content requiring durable attribution (per the platform's
   existing cascade/attribution rules) is handled consistently with how
   the platform already treats a removed user elsewhere.
6. **Given** any signed-in user, **When** they open their own profile,
   **Then** they can update their own name and other personal profile
   fields, and change their own password.

---

### User Story 3 - Role Management (Priority: P1)

An administrator assigns each user a platform-wide system role (Admin,
Manager, Editor, Viewer) that determines which administrative and
cross-project capabilities that user can access, and can define
additional custom roles built from a set of permission groups when the
four built-in roles don't fit an organization's needs.

**Why this priority**: Every administrative screen and security control
in this spec (US2, US5–US10) must be gated by *something* — role
management is that gate, and must exist before those other stories can
be meaningfully access-controlled.

**Independent Test**: Can be fully tested by assigning a user the Manager
system role and confirming they can access user management but not
system settings, independent of any specific permission-management
configuration (US4).

**Acceptance Scenarios**:

1. **Given** a user assigned the Admin system role, **When** they sign in,
   **Then** they can access every administrative area described in this
   specification (US2, US4–US10).
2. **Given** a user assigned the Manager system role, **When** they sign
   in, **Then** they can access user management and audit logs but not
   system settings or backup/restore (a reasonable, documented default
   split — see Assumptions).
3. **Given** a user assigned the Editor or Viewer system role, **When**
   they sign in, **Then** they see no administrative navigation at all —
   these two roles carry no admin capability by default, distinct from
   (and not to be confused with) the existing per-project Editor/Viewer
   membership roles.
4. **Given** an administrator, **When** they create a custom role by
   selecting a set of permission groups, **Then** that role becomes
   assignable to users and grants exactly the selected groups' access,
   no more and no less.
5. **Given** a custom role currently assigned to one or more users, **When**
   an administrator attempts to delete it, **Then** they are required to
   reassign those users first or the deletion is blocked with a clear
   explanation.

---

### User Story 4 - Permission Management (Priority: P2)

An administrator reviews and manages permission grants across the
platform — who has access to which projects, layers, features,
dashboards, analyses, and export capabilities — from a single
administrative view, and configures default permission policies applied
to newly created projects.

**Why this priority**: This extends visibility and control over
permissions already enforced elsewhere (project roles, dashboard shares)
into one administrative surface — valuable oversight, but the underlying
permission enforcement it surfaces already exists independently of this
story.

**Independent Test**: Can be fully tested by an administrator opening the
permission management view for a specific project and confirming it
accurately reflects that project's actual member roles and dashboard
shares — independent of role management configuration.

**Acceptance Scenarios**:

1. **Given** the permission management view, **When** an administrator
   selects a project, **Then** they see every member's project role and
   can change or revoke it, consistent with the platform's existing
   project-role enforcement.
2. **Given** a project's layers, **When** an administrator reviews
   layer-level access, **Then** any layer-specific restriction beyond the
   project's own role model (if configured) is visible and editable.
3. **Given** a project's dashboards, **When** an administrator reviews
   dashboard permissions, **Then** every dashboard share (view/edit,
   public/private) is visible and revocable from this one view, without
   needing to open each dashboard individually.
4. **Given** analysis and export capabilities, **When** an administrator
   reviews them, **Then** they can see which system/project roles are
   permitted to run spatial analyses or export data, and adjust the
   default policy for future projects.
5. **Given** an administrator changes a default permission policy, **When**
   a new project is subsequently created, **Then** it starts with that
   policy applied.

---

### User Story 5 - Audit Logs (Priority: P2)

An administrator reviews a platform-wide, searchable log of login
history, user actions, project actions, and security events (e.g.,
failed sign-ins, permission changes), and can export a filtered slice of
the log for compliance or investigation purposes.

**Why this priority**: Security and compliance oversight depends on a
trustworthy activity record; this builds directly on user/role/permission
management (US2–US4) having real actions worth logging, and is a
standard enterprise governance requirement.

**Independent Test**: Can be fully tested by performing a few actions
(sign-in, role change, deactivation) and confirming each appears
correctly in the audit log with who/what/when — independent of exporting.

**Acceptance Scenarios**:

1. **Given** any user sign-in attempt (successful or failed), **When** an
   administrator views login history, **Then** it is recorded with the
   user (or attempted email), outcome, timestamp, and originating IP.
2. **Given** an administrative action (create/deactivate/delete user,
   role change, permission change), **When** an administrator views the
   audit log, **Then** it is recorded with who performed it, what
   changed, and when.
3. **Given** project-level actions (already logged by the platform's
   existing activity trail), **When** an administrator views the
   platform-wide audit log, **Then** those same actions are visible
   alongside administrative events, not duplicated into a second record.
4. **Given** a security event (e.g., repeated failed sign-ins, an API key
   revoked), **When** an administrator views the log, **Then** it is
   clearly categorized as a security event, distinguishable from routine
   activity.
5. **Given** a date range and category filter, **When** an administrator
   exports the audit log, **Then** a downloadable file containing exactly
   the filtered entries is produced.

---

### User Story 6 - Security Settings (Priority: P2)

An administrator configures platform-wide security policy — minimum
password strength, how long an inactive session remains valid, rate
limits on sensitive actions, and an optional IP-address allowlist/
denylist — and every part of the platform enforces the configured policy.

**Why this priority**: These settings harden every other story in this
spec (especially Authentication, US1) but are a configuration layer on
top of capabilities that must already exist to be meaningfully
configurable.

**Independent Test**: Can be fully tested by lowering the session timeout
to a short value, confirming a session actually expires at that new
threshold — independent of audit logging or API keys.

**Acceptance Scenarios**:

1. **Given** a configured password policy (minimum length/complexity),
   **When** a user sets or resets a password, **Then** a password failing
   the policy is rejected with a specific, actionable message.
2. **Given** a configured session timeout, **When** a session exceeds that
   duration of inactivity, **Then** it expires (US1 Acceptance Scenario
   5), and changing the setting takes effect for sessions going forward.
3. **Given** a configured rate limit on a sensitive action (e.g.,
   sign-in attempts), **When** the limit is exceeded, **Then** further
   attempts are rejected for a cooldown period, reusing the platform's
   existing rate-limiting mechanism rather than a new one.
4. **Given** a configured IP allowlist/denylist, **When** a request
   originates from a disallowed address, **Then** it is rejected before
   authentication is even attempted.
5. **Given** a change to any security setting, **When** it is saved,
   **Then** the change itself is recorded in the audit log (US5).

---

### User Story 7 - API Key Management (Priority: P3)

A user (or an administrator, on a user's behalf) creates a scoped API
key for programmatic access, can rotate it (issuing a new secret while
retaining the key's identity/history), set or extend its expiration, and
review its usage log; an expired or revoked key stops working
immediately.

**Why this priority**: Programmatic/integration access is valuable for
enterprise customers but is additive to the platform's core interactive
use — no other story depends on it existing.

**Independent Test**: Can be fully tested by creating an API key scoped
to read-only access, confirming it can perform an allowed read request
and is rejected for a disallowed write request — independent of audit
logs or system settings.

**Acceptance Scenarios**:

1. **Given** a user with permission to create API keys, **When** they
   create one with a chosen scope (e.g., read-only, or limited to one
   project), **Then** a key is issued once (shown only at creation time)
   and never again exceeds the permissions the creating user themself
   holds.
2. **Given** an existing API key, **When** its owner rotates it, **Then**
   a new secret is issued for the same key identity, the old secret stops
   working immediately, and the key's usage history is preserved.
3. **Given** an API key nearing or past its expiration, **When** it is
   used, **Then** a request made after expiration is rejected, and the
   owner can extend the expiration before it lapses.
4. **Given** an API key, **When** its owner or an administrator revokes
   it, **Then** it stops working on the very next request.
5. **Given** an API key in active use, **When** its owner views its usage
   log, **Then** they see recent requests made with that key (endpoint,
   timestamp, outcome).

---

### User Story 8 - System Settings (Priority: P3)

An administrator configures platform-wide operational defaults — general
branding/naming, storage limits, default map view/basemap, outbound
email configuration, and backup scheduling — from one settings area.

**Why this priority**: These are operational conveniences that make the
platform easier to run at scale, but the platform functions with
reasonable built-in defaults even before an administrator visits this
area.

**Independent Test**: Can be fully tested by changing the default map
center/zoom in System Settings and confirming a newly created project
opens to that default — independent of backup or email configuration.

**Acceptance Scenarios**:

1. **Given** general settings (platform name, support contact), **When**
   an administrator updates them, **Then** they are reflected wherever
   the platform already surfaces that information.
2. **Given** storage settings (e.g., a per-project or per-user storage
   cap), **When** an administrator sets a limit, **Then** the platform's
   existing storage-usage reporting (Dashboard & Analytics' storage
   widget) reflects the configured cap, and relevant actions are blocked
   once exceeded.
3. **Given** map defaults (default center, zoom, basemap), **When** an
   administrator updates them, **Then** a newly created project uses
   those defaults.
4. **Given** email settings (outbound email provider configuration),
   **When** an administrator saves valid configuration, **Then** a test
   email can be sent to confirm it works, and password-reset (US1) /
   notification emails subsequently use it.
5. **Given** backup settings (schedule, retention), **When** an
   administrator configures them, **Then** the Backup & Restore story
   (US9)'s scheduled backups follow that configuration.

---

### User Story 9 - Backup & Restore (Priority: P3)

An administrator triggers an on-demand backup of a project's (or, across
all projects they administer, the platform's) data, schedules recurring
backups per System Settings (US8), downloads a backup as a portable
export, and restores a project from a previously created backup.

**Why this priority**: Disaster-recovery and data-portability tooling is
an important enterprise safety net, but is the least frequently used
capability in this specification and depends on there being real project
data (already provided by every prior feature) worth backing up.

**Independent Test**: Can be fully tested by triggering an on-demand
backup of a project, downloading it, and restoring a (test) project from
it — independent of scheduling.

**Acceptance Scenarios**:

1. **Given** a project, **When** an administrator (or project Owner)
   triggers an on-demand backup, **Then** a complete, point-in-time
   export of that project's layers, features, styles, dashboards, and
   configuration is produced.
2. **Given** backup settings configured (US8), **When** the scheduled
   time arrives, **Then** a backup is generated automatically and added
   to the project's backup history.
3. **Given** an existing backup, **When** an administrator downloads it,
   **Then** a complete, self-contained export file is produced.
4. **Given** a backup file, **When** an administrator restores it (into
   the same or a new project), **Then** the resulting project's data
   matches the backup's point-in-time state.
5. **Given** a restore in progress, **When** it fails partway (e.g.,
   malformed backup file), **Then** the target project is left in its
   original, unmodified state — never partially overwritten.

---

### User Story 10 - Monitoring (Priority: P3)

An administrator views a platform health dashboard summarizing storage
usage, user statistics (active/total users, sign-in activity), API usage
statistics, and basic system performance indicators, to understand the
platform's overall health at a glance.

**Why this priority**: Observability is valuable for ongoing operation
but is read-only oversight over data every other story in this spec (and
prior features) already produces — it has no functional dependents.

**Independent Test**: Can be fully tested by opening the health dashboard
and confirming displayed user/storage counts match the actual current
state — independent of any other administrative action.

**Acceptance Scenarios**:

1. **Given** the health dashboard, **When** an administrator opens it,
   **Then** they see current storage usage, active/total user counts, and
   a basic system-performance indicator (e.g., recent API error rate or
   response-time trend).
2. **Given** API key usage across the platform (US7), **When** an
   administrator views API statistics, **Then** they see aggregate
   request volume and error rate over a recent time window.
3. **Given** user statistics, **When** an administrator views them,
   **Then** they see sign-in activity trends (e.g., daily active users)
   over a recent time window.
4. **Given** a metric approaching a concerning threshold (e.g., storage
   near its configured cap, US8), **When** an administrator views the
   health dashboard, **Then** that metric is visually flagged.

---

### Edge Cases

- What happens when the platform's very first Admin user is created
  (bootstrap problem — no Admin exists yet to create one)? A documented,
  one-time bootstrap path (e.g., the first-ever registered account, or a
  seeded/configured initial Admin) is required, since no in-app "create a
  user" action can exist before at least one administrator does.
- What happens when the last remaining Admin user is deactivated or
  deleted? The system MUST prevent removing/demoting the platform's last
  Admin, so the platform is never left with zero administrators.
- What happens when a user is deactivated while they have an active
  session? Their session is invalidated on their next request, not just
  blocked from a future sign-in.
- What happens when an administrator changes their own role to something
  with less access (e.g., self-demotes from Admin to Viewer)? The action
  is allowed but requires explicit confirmation, since it may lock the
  administrator out of the area they're currently using.
- What happens when a password-reset link is used twice, or after it has
  expired? The second/expired use is rejected with a clear message, and
  does not reset the password again.
- What happens when an API key's scope is broader than what its owning
  user currently has permission for (e.g., the user's role was
  downgraded after the key was created)? The key's effective access is
  always capped at the current permissions of its owning user, checked
  at request time, not just at key-creation time.
- What happens when a restore targets a project that has been modified
  since the backup was taken? The administrator is warned that restoring
  will overwrite current data before the restore proceeds, requiring
  explicit confirmation.
- What happens when IP restrictions (US6) are misconfigured to block the
  administrator's own current address? The system provides a documented,
  out-of-band recovery path (e.g., a break-glass mechanism) rather than
  permanently locking out all administrative access.
- What happens when the audit log itself grows very large? Listing and
  export both remain responsive via pagination/filtering, never
  requiring a full-table load.

## Requirements *(mandatory)*

### Functional Requirements

**Authentication**

- **FR-001**: System MUST authenticate users via email and password,
  replacing the platform's current placeholder single-user access seam
  without requiring any other existing feature's Route Handlers to
  change.
- **FR-002**: System MUST support a self-service password reset flow via
  a time-limited, single-use link or code.
- **FR-003**: System MUST support persistent ("remember me") sessions up
  to a bounded maximum duration, and non-persistent sessions ending with
  the browser session otherwise.
- **FR-004**: System MUST expire a session after a configurable period of
  inactivity (US6) and MUST allow explicit sign-out that immediately
  invalidates the session.
- **FR-005**: System MUST prepare the authentication data model and
  settings surface for multi-factor authentication (an additional
  verification step) without requiring a working second-factor
  verification method to ship in this phase (see Assumptions).
- **FR-006**: Sign-in failure messages MUST NOT reveal whether a
  submitted email is registered.

**User Management**

- **FR-007**: System MUST allow an authorized administrator to create,
  search, deactivate, reactivate, and delete user accounts.
- **FR-008**: Deactivating a user MUST block their sign-in and invalidate
  any active session, while preserving their historical
  data/attribution.
- **FR-009**: System MUST allow any signed-in user to view and update
  their own profile (name, other personal fields, password).
- **FR-010**: System MUST prevent the platform from being left with zero
  Admin-role users (spec Edge Cases).

**Role Management**

- **FR-011**: System MUST provide four built-in platform-wide system
  roles (Admin, Manager, Editor, Viewer), each gating a documented set of
  administrative capabilities, distinct from the platform's existing
  per-project membership roles.
- **FR-012**: System MUST allow an administrator to define custom roles
  composed of selectable permission groups, assignable to users like a
  built-in role.
- **FR-013**: System MUST prevent deleting a role currently assigned to
  one or more users without first reassigning them.

**Permission Management**

- **FR-014**: System MUST provide an administrative view of project
  membership roles, dashboard shares, and analysis/export access policy
  across projects, reusing the platform's existing role/share enforcement
  rather than a parallel permission engine.
- **FR-015**: System MUST allow an administrator to change or revoke a
  project role or dashboard share from this administrative view.
- **FR-016**: System MUST allow an administrator to configure a default
  permission policy applied to newly created projects.

**Audit Logs**

- **FR-017**: System MUST record every sign-in attempt (success and
  failure), administrative action, and security event with who/what/when
  (and originating IP where applicable).
- **FR-018**: System MUST surface the platform's existing project-level
  activity trail alongside administrative/security events in one
  platform-wide audit view, without duplicating those entries into a
  second log.
- **FR-019**: System MUST allow filtering the audit log by date range and
  category, and exporting the filtered result as a downloadable file.

**Security Settings**

- **FR-020**: System MUST allow an administrator to configure a password
  policy (minimum length/complexity) enforced on every password
  set/reset.
- **FR-021**: System MUST allow an administrator to configure session
  timeout duration (FR-004).
- **FR-022**: System MUST allow an administrator to configure rate limits
  on sensitive actions, reusing the platform's existing rate-limiting
  mechanism.
- **FR-023**: System MUST allow an administrator to configure an optional
  IP allowlist/denylist enforced before authentication is attempted.
- **FR-024**: Every security setting change MUST be recorded in the audit
  log (FR-017).

**API Key Management**

- **FR-025**: System MUST allow creating a scoped API key whose secret is
  shown only once, at creation time.
- **FR-026**: An API key's effective access MUST never exceed its owning
  user's current permissions, checked at request time.
- **FR-027**: System MUST support rotating a key's secret (preserving its
  identity/usage history), setting/extending its expiration, and
  revoking it (effective immediately).
- **FR-028**: System MUST record per-key usage (endpoint, timestamp,
  outcome) reviewable by the key's owner.

**System Settings**

- **FR-029**: System MUST allow an administrator to configure general
  platform settings, storage limits, map defaults, outbound email
  configuration, and backup scheduling from one settings area.
- **FR-030**: A configured storage limit MUST be enforced (relevant
  actions blocked once exceeded) and reflected in existing storage-usage
  reporting.
- **FR-031**: Configured map defaults MUST apply to newly created
  projects.
- **FR-032**: System MUST allow sending a test email to validate email
  configuration before relying on it for password resets/notifications.

**Backup & Restore**

- **FR-033**: System MUST allow triggering an on-demand, point-in-time
  backup of a project's data (layers, features, styles, dashboards,
  configuration).
- **FR-034**: System MUST support scheduled, recurring backups per the
  configured backup settings (FR-029).
- **FR-035**: System MUST allow downloading a backup as a complete,
  self-contained export file.
- **FR-036**: System MUST allow restoring a project from a backup file,
  requiring explicit confirmation when the target project has data newer
  than the backup (spec Edge Cases).
- **FR-037**: A failed restore MUST leave the target project in its
  original, unmodified state.

**Monitoring**

- **FR-038**: System MUST provide a health dashboard showing storage
  usage, user statistics, API usage statistics, and a basic
  system-performance indicator.
- **FR-039**: System MUST visually flag a metric approaching a configured
  threshold (e.g., storage nearing its cap).

**Cross-Cutting**

- **FR-040**: Every administrative capability in this specification MUST
  be reachable only by a user whose system role (or custom role's
  permission groups) grants it, enforced server-side.
- **FR-041**: System MUST provide a documented bootstrap path for
  creating the platform's first Admin user (spec Edge Cases).

### Key Entities

- **User Credential**: The authentication material for a `User` (password
  hash, password-reset token state, remember-me/session tokens, MFA
  readiness flag) — extends the platform's existing `User` entity rather
  than replacing it.
- **Session**: An active authenticated session — its user, creation/last-
  activity time, expiration, and whether it is a persistent ("remember
  me") session.
- **System Role**: A platform-wide role (built-in: Admin/Manager/Editor/
  Viewer, or custom) assigned to a `User`, distinct from a project
  membership role.
- **Permission Group**: A named, reusable bundle of specific capabilities
  (e.g., "manage users," "view audit logs") that a System Role (built-in
  or custom) is composed of.
- **Audit Log Entry**: A record of a security-relevant or administrative
  event — actor, action, target, outcome, timestamp, originating IP where
  applicable.
- **Security Settings**: The platform's current password policy, session
  timeout, rate-limit configuration, and IP allow/deny list.
- **API Key**: A scoped, owned, revocable credential for programmatic
  access — its scope, expiration, rotation history, and usage log.
- **System Settings**: The platform's configured general/storage/map-
  default/email/backup settings.
- **Backup**: A point-in-time, downloadable export of a project's (or the
  platform's) data, with its creation time, trigger (manual/scheduled),
  and status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can sign in, and a returning user can reset a
  forgotten password and sign back in, entirely without administrator
  intervention, in under 3 minutes.
- **SC-002**: An administrator can create a new user account and have
  that person able to sign in within 2 minutes of account creation.
- **SC-003**: 100% of sign-in attempts, administrative actions, and
  security events are present and correctly attributed in the audit log,
  verified against a controlled test sequence.
- **SC-004**: 100% of administrative actions attempted by a user whose
  role does not grant them are blocked, with zero resulting data changes.
- **SC-005**: An administrator can locate any user account (from a
  directory of at least 10,000 users) via search in under 5 seconds.
- **SC-006**: A project backup can be downloaded and used to restore a
  project's data to its exact point-in-time state, verified byte-for-byte
  equivalent on the restored spatial data.
- **SC-007**: The platform is never left in a state with zero Admin-role
  users, verified across every user-management and role-management
  action.
- **SC-008**: An administrator can assess overall platform health
  (storage, users, API activity, performance) from the monitoring
  dashboard in under 30 seconds without consulting any other screen.

## Assumptions

- This specification implements the platform's **first real
  authentication system**, replacing the interim, single-user
  `DEV_USER_ID` placeholder seam already documented in the codebase as a
  temporary stand-in "MUST be replaced before any multi-user or public
  deployment." Every other existing feature already resolves the acting
  user through one seam function, so this replacement is designed to
  require no change to any other feature's Route Handlers, repositories,
  or authorization checks — only that one seam's implementation changes.
- "Platform-wide system roles" (US2/US3: Admin, Manager, Editor, Viewer,
  custom) are a **new, separate concept** from the existing per-project
  membership roles (Owner/Editor/Viewer) the Collaboration feature
  already established. The shared naming (Editor/Viewer appearing in
  both) is coincidental terminology, not the same mechanism — a user's
  system role governs administrative/cross-project capability; their
  project role (unchanged, reused as-is) governs what they can do inside
  a specific project.
- **Story numbering differs from the request's input order**: this spec
  prioritizes Authentication as US1 (the platform has no real sign-in
  today, so it is the single most foundational story), followed by User
  Management (US2), Role Management (US3), and Permission Management
  (US4) — the request's original User Management/Role Management/
  Permission Management/Authentication ordering is preserved for every
  other story (US5–US10 are unchanged). This is a prioritization
  re-ordering, not a scope change — every user story from the original
  request is present.
- Permission Management (US4) is administrative **oversight and
  default-policy configuration** over permission mechanisms the platform
  already enforces (project roles from Collaboration, dashboard shares
  from Dashboard & Analytics) — it does not introduce a second, parallel
  permission-checking engine; it manages the existing one's data and
  adds platform-wide default policy for new projects.
- Manager's exact capability split (Acceptance Scenario US3.2: user
  management and audit logs, but not system settings/backup) is a
  reasonable default split between the two non-Admin/non-baseline system
  roles; the underlying Permission Group model (US3/FR-012) allows this
  to be reconfigured later without a schema change.
- Multi-factor authentication is **prepared for, not fully implemented**
  in this phase (FR-005) — the data model and a settings toggle exist,
  but shipping a working second-factor verification method (e.g., TOTP
  authenticator-app codes) is deferred; "MFA ready" in the request is
  read as groundwork, not a working second factor, since no specific MFA
  method was specified and each has different UX/vendor implications.
- Sending real email (password reset, MFA if later enabled, test emails
  from System Settings) requires an outbound email capability the
  platform does not have today; this specification treats "Email
  settings" (US8) as the place an administrator configures a standard
  transactional-email provider, and password reset (US1) depends on that
  configuration existing — a reasonable default for any web platform's
  first authentication system.
- Backup & Restore (US9) is an **application-level** capability — a
  structured, complete export/reimport of a project's data reusing the
  platform's existing export architecture (Spatial Analysis's and
  Dashboard & Analytics' established export patterns) — not a
  database-server-level (e.g., raw `pg_dump`) infrastructure feature.
  True disaster-recovery-grade database backup remains the operating
  team's infrastructure responsibility outside this application, since
  the platform must remain portable across multiple deployment targets
  (Vercel, Railway, Docker, AWS, Supabase) with different levels of
  direct database-server access.
- API keys (US7) are scope-limited, capped at their owning user's current
  permissions (FR-026) — never a full, unrestricted session-equivalent
  credential, per standard API-security practice.
- IP restrictions (US6/FR-023) are platform-wide (administrator-
  configured), not per-project, matching how session/password/rate-limit
  policy is scoped in this specification.
- Machine learning-driven anomaly detection, SSO/enterprise identity
  provider federation (SAML/OIDC), and dedicated compliance-certification
  tooling (e.g., SOC 2 report generation) are not requested and are
  out of scope for this feature.
