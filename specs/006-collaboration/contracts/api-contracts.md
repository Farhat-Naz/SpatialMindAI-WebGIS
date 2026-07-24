# API Contracts: Real-Time Collaboration

**Feature**: 006-collaboration

This feature introduces **21 new Route Handlers** plus one narrow,
explicitly-documented change to two existing ones (`PATCH`/`DELETE` on a
feature — see "Conflict Resolution" below). Every new endpoint follows
the identical shape every existing Route Handler already uses:
`getCurrentUser` → `assertWriteRateLimit` (write endpoints; new
`collaboration:write` bucket) → Zod validate → repository call →
`handleRouteError`. Cross-owner/cross-member requests return `404`
(non-disclosure, unchanged); a role-insufficient request from a genuine
member returns the new `403 FORBIDDEN` (research.md Decision 10).

---

## Project Sharing & Membership

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/projects/:projectId/invitations` | `POST` | Invite a user (Owner only) — body `{ invitedUserId, role: "Editor"\|"Viewer" }` → `201` with the `Invitation`, or the existing pending one unchanged (Edge Cases: duplicate invitations) |
| `/api/projects/:projectId/invitations` | `GET` | List a project's invitations (Owner only) |
| `/api/invitations/:invitationId/accept` | `POST` | Invited user accepts → creates their `ProjectMember` row, notifies the inviting Owner (FR-012) |
| `/api/invitations/:invitationId/decline` | `POST` | Invited user declines → `status: "declined"` |
| `/api/projects/:projectId/members` | `GET` | List current members + roles (any member) |
| `/api/projects/:projectId/members/:userId` | `PATCH` | Change a member's role (Owner only) — body `{ role: "Editor"\|"Viewer" }`; releases that member's active `FeatureLock`s if downgraded (Edge Cases: permission changes during editing) |
| `/api/projects/:projectId/members/:userId` | `DELETE` | Remove a member (Owner only) — `204`; releases their locks/presence immediately |
| `/api/projects/:projectId/transfer-ownership` | `POST` | Transfer ownership to an existing member (Owner only) — body `{ newOwnerUserId }`; updates `Project.ownerId` and both members' `ProjectMember.role` in one transaction (FR-003) |

**Errors** (all): `404` — project/invitation/member not found or not
accessible; `403` — acting user lacks the required role (e.g., an Editor
calling any Owner-only endpoint above, US1 acceptance scenarios 5–6);
`400` — malformed body, or inviting a user who is already a member.

---

## Comments

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/features/:featureId/comments` | `GET` | List a feature's comments, threaded (top-level + nested replies) |
| `/api/features/:featureId/comments` | `POST` | Create a comment or reply — body `{ body: string, parentCommentId?: string }`; `@username` tokens parsed into `mentionedUserIds`, each triggering a `mention` notification (FR-034) |
| `/api/comments/:commentId` | `PATCH` | Edit body or toggle `resolved` — author-only for body edits; any member may toggle `resolved` |
| `/api/comments/:commentId` | `DELETE` | Delete — author-only (FR-035); `204` |

**Errors**: `404` — comment/feature not found or not accessible; `403` —
editing/deleting another member's comment.

---

## Activity History

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/projects/:projectId/activity` | `GET` | Cursor-paginated timeline, newest first (`?cursor=&limit=`), matching `GET /api/layers/:layerId/features`'s existing pagination shape exactly |

No write endpoint exists for this resource at all — `Activity` rows are
only ever written internally, in the same transaction as the action they
record (research.md Decision 8); there is no API surface capable of
creating, editing, or deleting one (FR-047).

---

## Version History

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/projects/:projectId/versions` | `POST` | Save a version — body `{ note?: string }` → `201` with the new `Version` (metadata only, not the full snapshot) |
| `/api/projects/:projectId/versions` | `GET` | Cursor-paginated list, newest first (metadata only) |
| `/api/versions/:versionId` | `GET` | Full detail including `snapshot` |
| `/api/versions/:versionId/restore` | `POST` | Restore — `201` with the **new** pre-restore `Version`; the actual restored state is fetched via the existing layer/feature endpoints afterward, not returned inline (FR-028/FR-029) |
| `/api/versions/compare` | `GET` | Query params `a`, `b` (version ids) → `{ added, changed, removed }` diff summary (FR-030) |

**Errors**: `404` — version/project not found or not accessible.

---

## Presence

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/projects/:projectId/presence/heartbeat` | `POST` | Upsert the caller's presence — body `{ cursor?: [lng, lat], viewportBounds?: [w,s,e,n], currentFeatureId?: string }`; refreshes `lastSeenAt`; broadcasts via the project's SSE channel (research.md Decisions 1–3) |
| `/api/projects/:projectId/presence` | `GET` | Initial snapshot of currently-active members (rows with `lastSeenAt` within the timeout) — used once on page load before the SSE connection takes over live updates |

No `DELETE`/explicit "leave" endpoint — presence expires naturally via
the read-time timeout check (research.md Decision 3); an explicit
project-close action may still call the heartbeat endpoint one last time
with no fields to age the row out sooner, but this is a UX nicety, not a
required call.

---

## Feature Locking

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/features/:featureId/lock` | `POST` | Acquire or heartbeat-refresh a lock — `201` (new) or `200` (refreshed by the same holder); `409` if held by someone else and unexpired (US3 scenario 2) |
| `/api/features/:featureId/lock` | `DELETE` | Release — called on save-success and on cancel (US3 scenarios 3–4); `204` |

**Errors**: `409 CONFLICT` (new code) — feature is locked by a different,
unexpired holder; `404` — feature not found or not accessible.

---

## Notifications

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/notifications` | `GET` | Cursor-paginated list of the caller's own notifications, newest first, plus an `unreadCount` field in the response envelope (FR-038) |
| `/api/notifications/:notificationId/read` | `PATCH` | Mark one read — `200`; a caller may only mark their own |
| `/api/notifications/mark-all-read` | `POST` | Mark every one of the caller's unread notifications read — `200` |

**Errors**: `404` — notification not found or not the caller's own
(non-disclosure — never reveals whether a notification id belongs to
someone else).

---

## Real-Time Stream

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/projects/:projectId/stream` | `GET` | Opens an SSE (`text/event-stream`) connection; the client's `EventSource` receives `feature`, `layer`, `presence`, `lock`, `comment`, and `notification` event types as they occur in that project (research.md Decisions 1–2). Requires project access exactly like every other endpoint (`404` for non-members before the stream opens) |

---

## Conflict Resolution (extends two existing endpoints, not new ones)

`PATCH /api/features/:featureId` and `DELETE /api/features/:featureId`
(003-database-foundation, unchanged signatures) each gain:

- An accepted, optional `expectedUpdatedAt` field in the `PATCH` body
  (existing `updateFeatureSchema`, additive optional field) — when
  provided and it no longer matches the feature's current `updatedAt`,
  the request is rejected `409 CONFLICT` with both the caller's expected
  and the feature's actual current state in the response body, rather
  than silently overwriting (research.md Decision 5; spec Assumptions —
  never silently discard).
- A `FeatureLock` check (research.md Decision 4) — rejected `409
  CONFLICT` if a different, unexpired lock exists.

This is the one place this feature touches an existing contract; the
change is additive (an optional new field, a new possible `409` outcome)
and every existing caller that never sends `expectedUpdatedAt` or never
encounters a lock sees no behavior change at all.

## Offline Sync (client-side replay through existing + above endpoints, not a new endpoint)

There is no dedicated "sync" endpoint. A reconnecting client replays its
IndexedDB-queued edits, one at a time and in order, through the exact same
feature create/update/delete endpoints above (each carrying its cached
`expectedUpdatedAt`), letting the Conflict Resolution behavior just
described detect and surface any conflict per queued edit (research.md
Decision 6).
