# Repository Contract: Real-Time Collaboration

**Feature**: 006-collaboration

Eight new repository files, one new server-only realtime module, one new
authorization helper module, and one narrow modification to two existing
`featureRepository.ts` functions. Every new/modified function follows the
identical ownership-scoped, `NotFoundError`/`ForbiddenError`-throwing
convention `featureRepository.ts` already established.

## New repositories

| File | Key functions |
|---|---|
| `membershipRepository.ts` | `listMembersForProject`, `changeMemberRole` (releases active locks on downgrade), `removeMember` (releases locks/presence), `transferOwnership` (updates `Project.ownerId` + both `ProjectMember.role` in one transaction) |
| `invitationRepository.ts` | `createInvitation` (no-op on an existing pending/member match, Edge Cases), `listInvitationsForProject`, `acceptInvitation` (creates `ProjectMember`, writes `Activity`, sends `Notification`), `declineInvitation` |
| `commentRepository.ts` | `listCommentsForFeature` (threaded), `createComment` (parses `@mentions`, writes `Notification` per mention), `updateComment` (author-only), `resolveComment`, `deleteComment` (author-only, cascades to replies) |
| `activityRepository.ts` | `recordActivity(tx, ...)` — takes an **existing transaction client**, not its own; called from inside every other repository function that performs a recordable action (research.md Decision 8), never invoked standalone from a Route Handler. `listActivityForProject` (cursor-paginated) is the only reader. |
| `versionRepository.ts` | `saveVersion` (snapshots all layers/features), `listVersionsForProject`, `getVersionById`, `restoreVersion` (pre-restore snapshot + replace + `Activity` row, one transaction), `compareVersions` |
| `notificationRepository.ts` | `createNotification(tx, ...)` (same in-transaction convention as `recordActivity`), `listNotificationsForUser` (+ `unreadCount`), `markNotificationRead`, `markAllNotificationsRead` |
| `featureLockRepository.ts` | `acquireOrRefreshLock` (409 if held by another unexpired holder), `releaseLock`, `getActiveLockForFeature` (expiry-checked at read time, research.md Decision 3) |
| `presenceRepository.ts` | `upsertPresence` (heartbeat), `listActivePresenceForProject` (filters stale rows at read time, opportunistically deletes them) |

## Modified: `featureRepository.ts`

| Function | Change |
|---|---|
| `updateFeature` | Gains a guard clause calling `getActiveLockForFeature` first — throws the new `ConflictError` if locked by a different user; if `expectedUpdatedAt` is provided and mismatches, also throws `ConflictError` (research.md Decisions 4–5). Existing behavior for every other case is unchanged. |
| `deleteFeature` | Gains the same lock guard clause. |

## New: `src/server/realtime/channel.ts`

| Export | Purpose |
|---|---|
| `publish(channel, event)` | Issues `pg_notify` inside the caller's transaction (used by every repository function above that changes broadcastable state) |
| `subscribe(channel, onEvent)` | Used only by the SSE Route Handler — opens/reuses this process's single dedicated `pg` `LISTEN` connection and registers a callback for one project's channel |

This is the **only** file in this feature holding a raw `pg` client
connection; every other new file still goes through `prismaClient` like
every existing repository (research.md Decision 2).

## New: `src/server/auth/assertProjectRole.ts`

| Export | Purpose |
|---|---|
| `assertProjectRole(projectId, userId, minRole)` | Throws the new `ForbiddenError` (→ `403`) if the caller's role is below `minRole`; throws the existing `NotFoundError` if they have no access at all. Called at the top of every write Route Handler across 003/004/005/006 that previously had no role concept (research.md Decision 10). |

## New error classes (`src/shared/errors/apiError.ts`, additive)

| Class | HTTP status | `code` |
|---|---|---|
| `ForbiddenError` | `403` | `FORBIDDEN` |
| `ConflictError` | `409` | `CONFLICT` |

Both follow the exact existing `toErrorResponse`/`handleRouteError`
pattern — two new entries in the same lookup table, no new error-handling
mechanism.
