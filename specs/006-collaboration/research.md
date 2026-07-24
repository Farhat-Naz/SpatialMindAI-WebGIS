# Research: Real-Time Collaboration

**Feature**: 006-collaboration
**Date**: 2026-07-23

All decisions below extend the patterns already established by
003-database-foundation, 004-map-editing-ui, and 005-spatial-analysis-
geoprocessing (constitution v3.0.0). This is the first feature to
introduce multi-user access to a Project — several decisions here
necessarily broaden an existing pattern (ownership-scoping) rather than
leaving it untouched; each such case is called out explicitly with why a
narrower, purely-additive approach isn't possible.

---

## Decision 1: Real-time transport — Server-Sent Events, not WebSocket

**Decision**: Live updates (feature/layer changes, presence, lock state,
notifications) are pushed to clients via **Server-Sent Events (SSE)** —
one `GET` Route Handler per project returning a streamed
`text/event-stream` response — not a raw WebSocket server.

**Rationale**: The plan explicitly must support deployment on Vercel,
Railway, Docker, and AWS (Deployment section). A raw WebSocket server
needs a long-lived process performing its own connection-upgrade
handshake — straightforward on Railway/Docker/AWS-with-a-persistent-
process, but not a first-class fit for Vercel's Function model even with
Fluid Compute (which extends execution duration for regular Node.js code,
but does not turn a Function into a dedicated WebSocket-upgrade-capable
server). SSE is a plain, long-lived HTTP response stream — it runs
identically inside a Next.js Route Handler on every one of the four
target platforms, requires no reverse-proxy WebSocket configuration
anywhere, and needs no new server process. It is also a strictly better
fit for this feature's actual traffic shape: every live update in this
spec (US2, US3, US7, US9) is a **server → client broadcast**; the only
client → server traffic (edits, cursor moves, lock acquire/release) is
already, or becomes, a normal `POST` to an existing-shaped Route Handler
— nothing in this spec requires true low-latency bidirectional framing.
The browser's native `EventSource` also auto-reconnects on its own,
directly satisfying FR-018's "automatically re-establish... without a
manual reload" for free, rather than requiring hand-rolled reconnect
logic.

**Alternatives considered**: Raw WebSocket via a custom server
(rejected — needs a dedicated long-running process, the one option least
portable across the four required deployment targets, and "do not
redesign" argues against introducing a second server process alongside
the existing single Next.js app); a third-party realtime service
(Pusher/Ably/Supabase Realtime) (rejected — a new external paid
dependency and credential surface for a problem the existing Postgres
instance already solves, see Decision 2; also the least "reuse existing
architecture" option of all three); long-polling (rejected — strictly
worse latency and connection overhead than SSE for the same one-way
broadcast shape, with none of SSE's native browser reconnect support).

---

## Decision 2: Fan-out mechanism — PostgreSQL `LISTEN`/`NOTIFY`

**Decision**: A Route Handler that changes shared state (feature edit,
lock acquire/release, presence heartbeat, comment, notification) issues a
`pg_notify(channel, payload)` inside the same transaction as its write.
Each server instance holding open SSE connections keeps exactly one
dedicated raw `pg` (`node-postgres`) client per Node process
`LISTEN`-ing on this feature's channels, fanning out incoming
notifications to every open SSE stream for the matching project.

**Rationale**: `LISTEN`/`NOTIFY` is a native PostgreSQL pub/sub primitive
— using it introduces **zero new infrastructure** (no message broker, no
new managed service), reusing the exact same PostGIS-backed Postgres
instance every prior feature already requires. It is the most
"reuse existing architecture" option available for the one genuinely new
capability this feature needs (cross-instance fan-out), and keeps this
feature's real-time layer entirely inside the existing database
boundary, consistent with Constitution Principle I's Route-Handler/
repository-only data-access boundary. The one new dependency this
requires is the `pg` package for the dedicated listening connection
(Prisma Client has no `LISTEN`/`NOTIFY` API) — a minimal, standard,
widely-used low-level Postgres driver, not a new architectural layer.

**Alternatives considered**: An in-memory `EventEmitter` per process
(rejected — does not fan out across multiple server instances/regions,
which any of the four target deployment platforms may run); Redis
pub/sub (rejected — a new infrastructure dependency this project does not
already have, for a problem Postgres already solves natively); a
database-polling loop from each client (rejected — far higher latency
and load than push-based `NOTIFY`, and harder to keep within SC-002's
5-second budget at 100 concurrent editors).

---

## Decision 3: Presence synchronization — ephemeral DB rows + heartbeat, expiry computed at read time

**Decision**: An active member's presence (cursor, map extent, currently-
edited feature) is a row in a `Presence` table, upserted on a periodic
client heartbeat (every ~10 s) and on every cursor/extent/edit-target
change, broadcast via Decision 2's channel. A presence row is treated as
"offline" the moment it is older than the 30-second timeout (spec
Assumptions) — checked at **read time** (when building the presence
list) rather than via a separate scheduled cleanup job, since this
project has no existing background-job/cron infrastructure to reuse and
introducing one would be a new architectural capability this feature
does not need to justify. A lightweight opportunistic delete (stale rows
removed the next time any presence write touches that project) keeps the
table from growing unbounded without a dedicated worker.

**Rationale**: Matches FR-046/SC-006 exactly (disappear "shortly after
disconnect," never instantly, never indefinitely) using only a heartbeat
+ a timestamp comparison — no new infrastructure, and trivially testable
(a presence row's `lastSeenAt` is just a timestamp column).

**Alternatives considered**: A dedicated cleanup cron job (rejected — new
infrastructure this codebase has none of yet; a read-time TTL check
achieves the same user-visible guarantee without it); purely in-memory
presence with no DB row at all (rejected — would not survive/fan out
across multiple server instances, the same problem Decision 2 solves for
broadcast).

---

## Decision 4: Feature locking — a DB row, checked inside the existing feature-write path

**Decision**: `FeatureLock` is a table with a unique `featureId`,
`lockedByUserId`, and `expiresAt` (rolling — refreshed on every edit
"heartbeat" while the holder is active, per Assumptions' 15-minute
timeout). Acquiring a lock is a new, small repository function; the
**existing** `updateFeature`/`deleteFeature` repository functions
(003-database-foundation) gain one additional check at their top —
reject with a new `ConflictError` (→ `409`) if a *different*, still-
unexpired lock exists on that feature — before their existing logic runs
unchanged.

**Rationale**: Locking must be enforced at the exact same choke point
every feature write already passes through, or it could be bypassed
entirely by a client calling the existing endpoint directly — there is no
way to add real enforcement without touching those two functions. The
change is minimal and additive (one guard clause at the top of each), not
a rewrite of either function's existing behavior, and keeps the
enforcement point identical to the ownership check already there rather
than introducing a second, parallel write path.

**Alternatives considered**: Enforcing locks only in the client UI
(rejected — trivially bypassable via a direct API call, defeating US3's
entire purpose); a separate "locked feature" API surface distinct from
the existing feature endpoints (rejected — would let an un-lock-aware
caller bypass the check entirely, and duplicates the existing feature
write path for no benefit).

---

## Decision 5: Conflict resolution — optimistic concurrency via `updatedAt`, never silent

**Decision**: Every feature (already has `updatedAt`, 003-database-
foundation) is compared at sync/edit time: a write submitted with a
client-known `updatedAt` that no longer matches the feature's current
`updatedAt` is rejected as a conflict (`409`, new `ConflictError`) rather
than blindly overwritten. This single mechanism serves **both** US3
(a lock prevents the concurrent-write window from opening in the first
place) **and** US8 (an offline edit's cached `updatedAt`, checked once
connectivity returns, is what detects a server-side change made while
disconnected).

**Rationale**: Reuses a column every feature already has — no new
"version number" column, no vector clock, no CRDT merge logic. Matches
the spec's explicit, acceptance-criteria-derived rule from Assumptions:
never silently resolve a conflict (e.g., last-write-wins) — surfacing a
409 with both versions available for the client to reconcile is the
literal implementation of that rule.

**Alternatives considered**: A dedicated monotonic version-number column
per feature (rejected — `updatedAt` already provides the same
conflict-detection guarantee with no new column); CRDTs/operational
transforms (rejected — substantial new complexity for a spec whose
locking mechanism already prevents the concurrent-edit case from arising
in the connected-collaboration path; only the offline path needs conflict
*detection*, not automatic merge, per Assumptions).

---

## Decision 6: Offline synchronization — client-side IndexedDB queue, replayed through existing mutations

**Decision**: A disconnected client's edits are cached in the browser's
IndexedDB (via a small queue wrapper, no new heavy dependency), tagged
with the feature's last-known `updatedAt`. On reconnect, queued edits are
replayed **in order**, one at a time, through the exact same React Query
mutations (`useUpdateFeature`, `useCreateFeature`, etc.) 004-map-editing-
ui already defines — each replay either succeeds normally or surfaces
Decision 5's `409` conflict for the client to resolve.

**Rationale**: IndexedDB is the standard browser API for durable,
structured client-side storage surviving a page reload — `localStorage`
is both too small and unstructured for a queue of pending mutations.
Replaying through the *existing* mutation hooks (rather than a new,
parallel "offline sync" API) means the server-side validation, ownership,
and role checks an online edit already goes through apply identically to
a replayed offline edit — no new, potentially weaker, validation path.

**Alternatives considered**: A dedicated bulk "sync" endpoint accepting a
batch of queued edits at once (rejected — would need its own,
duplicate validation/authorization/locking logic, whereas replaying
through the existing per-edit endpoints reuses all of it for free, at the
cost of one HTTP round trip per queued edit rather than one per batch —
an acceptable trade-off given queued-edit volumes are bounded by how long
one member can plausibly work offline, not by dataset size).

---

## Decision 7: Version storage — full JSON snapshot per version

**Decision**: `Version.snapshot` is a `Json` column holding the complete
serialized state of every layer/feature/attribute/style in the project at
save time (the same shape `exportLayerAsGeoJson`-style aggregation
already produces per layer, 005-spatial-analysis-geoprocessing, applied
across every layer in the project). Comparing two versions (FR-030) diffs
two already-materialized snapshots at read time; restoring (FR-028)
replaces current layers/features with a snapshot's content inside one
transaction, after first saving a new "pre-restore" snapshot (FR-029).

**Rationale**: A full snapshot makes both compare and restore simple,
correct operations over two static JSON blobs — an incremental/delta
representation would need to replay a chain of diffs to reconstruct any
single version, adding real complexity for a feature whose own success
criteria (SC-007) is about correctness ("never fewer versions than
before"), not storage minimization. Postgres `JSONB` handles this volume
comfortably even at the Performance section's 50,000-feature scale,
consistent with 004/005's precedent of using `Json` columns for
comparably-sized structured data.

**Alternatives considered**: Storing only a diff against the prior
version (rejected — meaningfully more complex to implement correctly and
to restore from, for a feature whose acceptance criteria emphasize
correctness of restore/compare over storage efficiency); storing versions
as new rows in the existing `Feature` table with a version marker
(rejected — would entangle version history with 003/004's live feature
table and its existing queries, the opposite of the additive,
non-redesigning approach this plan otherwise follows).

---

## Decision 8: Activity log — append-only table, written in the same transaction as the action

**Decision**: `Activity` is an append-only table (no update, no delete
API — FR-047's immutability requirement enforced by simply never
exposing a mutation path for it). Every action this spec must record
(FR-023) writes its `Activity` row inside the **same** database
transaction as the action itself, in every repository function that
performs one of those actions — never as a separate, best-effort,
after-the-fact call that could be skipped by a crash or an error.

**Rationale**: Writing the audit row in the same transaction as the
action is the only way to guarantee FR-023's "automatically recorded, no
member action required" and FR-047's immutable-audit-log guarantee
together — a fire-and-forget log write after the fact could silently
miss an action if anything failed between the two calls.

**Alternatives considered**: A separate logging service called
asynchronously after the action commits (rejected — cannot guarantee
FR-023's "every action is recorded," since the two calls are not
atomic together); deriving activity retroactively from a database change-
data-capture stream (rejected — new infrastructure this project has none
of, for a problem an in-transaction insert already solves simply).

---

## Decision 9: Notification delivery — in-app only, DB-backed, pushed via the same SSE channel

**Decision**: `Notification` is a per-recipient-user table (read/unread,
type, payload). A notification-triggering event (FR-036) writes a
`Notification` row and issues a `pg_notify` on that user's personal
channel (Decision 2), which their open SSE connection (Decision 1) uses
to push a live unread-count update; the notification list itself is
fetched/paginated via a normal React Query-backed Route Handler, matching
every other list in this feature (Activity, Comments).

**Rationale**: Reuses Decisions 1–2's transport entirely rather than
introducing a second live-update mechanism just for notifications; the DB
table is the durable source of truth (so a notification is never lost if
the recipient wasn't connected when it fired), while the SSE push is
purely a "wake up and refetch" signal, not the notification's system of
record.

**Alternatives considered**: Email delivery (out of scope per spec
Assumptions — no existing email-sending infrastructure in this project,
and adding one is a substantially larger, separate integration than this
feature's scope); push notifications via a browser Push API subscription
(rejected — significant new infrastructure — VAPID keys, service worker
push handling — for a spec that explicitly scopes delivery to "in-app
only" for this iteration).

---

## Decision 10: Security model — broadening the existing ownership pattern, plus one new authorization layer

**Decision**: This is the one place this plan touches existing code
directly, and it is done narrowly and explicitly:

- `getProjectById`, `getLayerScopedToOwner`, and `getFeatureScopedToOwner`
  (003-database-foundation) currently resolve access via `project.ownerId
  = :userId` only. Each gains one broadened `WHERE` clause —
  `project.ownerId = :userId OR project.members contains an active
  ProjectMember row for :userId` — with **no change to any function's
  signature, callers, or Route Handler**. This is necessarily a
  modification, not a purely additive extension: without it, an invited
  Editor/Viewer cannot access a shared project's data through any
  existing endpoint at all, which would make US1's core promise
  ("invited user gains access") impossible to deliver through the
  existing architecture. The parameter name `ownerId` is deliberately
  left unchanged (not renamed to something like `actingUserId`) across
  every call site to avoid an unrelated, large-blast-radius rename purely
  for cosmetics — documented here explicitly as an accepted, intentional
  naming inconsistency, not an oversight.
- A **new** authorization layer, `assertProjectRole(projectId, userId,
  minRole)`, is added and called at the top of every *write* Route
  Handler across 003/004/005 that did not previously have any concept of
  roles (feature/layer create/update/delete, and this feature's own new
  endpoints) — one new line per handler, before existing logic, rejecting
  a Viewer's write attempt (FR-005) with a **new** error class,
  `ForbiddenError` → HTTP `403`. A `403` (not `404`) is used here
  deliberately: unlike a non-member being denied all knowledge that a
  project exists (the existing `NotFoundError` non-disclosure pattern,
  unchanged), a Viewer already has legitimate read access to the project
  and is only being told their role doesn't permit this specific write —
  disclosing that distinction is not a security concern the way
  disclosing a stranger project's existence would be.
- Every new write endpoint in this feature follows the exact existing
  `getCurrentUser` → `assertWriteRateLimit` → Zod validate →
  ownership/role-scoped repository call → `handleRouteError` shape,
  extended with a `collaboration:write` rate-limit bucket alongside the
  existing per-feature buckets.

**Rationale**: Explained inline above per bullet — each change is the
minimum necessary to make multi-user access possible at all, applied
uniformly rather than as a one-off special case.

**Alternatives considered**: A parallel "collaboration-aware" set of
feature/layer endpoints, leaving the original single-owner ones
untouched (rejected — would mean two different code paths for the same
action with different authorization guarantees, a much larger surface
for the two to silently drift apart than one broadened check applied
everywhere); role checks performed only in the client UI (rejected —
trivially bypassable, and Constitution Principle VI requires
authorization enforced server-side before any handler logic runs).

---

## Decision 11: Comment mentions — plain `@username` token parsing, no rich-text editor

**Decision**: A mention (FR-034) is detected by parsing `@` followed by a
known project member's identifier out of a comment's plain-text body at
save time — no new rich-text/WYSIWYG editor dependency.

**Rationale**: The spec's Comments requirements (US6) do not ask for rich
formatting, only threading, resolution, and mentions — a plain-text
parse is the minimal mechanism satisfying FR-034 without a new heavy
editor dependency, consistent with Performance's dependency-weight
discipline established in 004/005.

**Alternatives considered**: A full rich-text editor library with a
structured mention "chip" data model (rejected — meaningfully heavier
dependency and complexity than this spec's actual comment requirements
justify).

---

## Decision 12: Performance — pagination, indexing, and connection-count discipline

**Decision**: Every list this feature introduces (Activity, Comments,
Notifications, Version History) is cursor-paginated identically to
003-database-foundation's existing feature-listing pattern. Every new
table's foreign keys and every field used in an access-control `WHERE`
clause gets an index (see data-model.md). SSE connection count per
project is the practical scaling limit at "100 concurrent editors" — a
single Node process holds one open response stream per connected client,
which is within normal Node.js concurrent-connection capacity; horizontal
scaling across multiple instances is exactly what Decision 2's
`NOTIFY`-based fan-out (not sticky, in-memory-only routing) already
supports.

**Rationale**: Matches Constitution Principle V directly (paginate,
index, avoid unnecessary re-renders) applied to this feature's new data,
and confirms the "100 concurrent editors" performance target is met by
Decision 1/2's chosen architecture rather than requiring a separate
scaling mechanism.

**Alternatives considered**: A dedicated realtime-scaling service
(rejected — Decision 1/2 already scale horizontally across instances via
Postgres `NOTIFY`, so no additional scaling infrastructure is needed for
the stated 100-concurrent-editor target).
