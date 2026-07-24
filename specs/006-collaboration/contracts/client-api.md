# Client Contracts: Services, Hooks, Store, Realtime (Real-Time Collaboration)

**Feature**: 006-collaboration

A **new feature module**, `src/features/collaboration/`, following the
same structure every existing feature module uses. It consumes
`database`'s public barrel (`useDatabaseStore`, `useLayers`,
`useFeatures`) and `analysis`'s barrel where relevant, never their
internals.

---

## Services (`src/features/collaboration/services/`)

| Service | Methods |
|---|---|
| `membershipService.ts` | `listMembers`, `changeRole`, `removeMember`, `transferOwnership` |
| `invitationService.ts` | `invite`, `listInvitations`, `accept`, `decline` |
| `commentService.ts` | `listComments`, `createComment`, `updateComment`, `resolveComment`, `deleteComment` |
| `activityService.ts` | `listActivity` |
| `versionService.ts` | `saveVersion`, `listVersions`, `getVersion`, `restoreVersion`, `compareVersions` |
| `notificationService.ts` | `listNotifications`, `markRead`, `markAllRead` |
| `lockService.ts` | `acquireLock`, `releaseLock` |
| `presenceService.ts` | `heartbeat`, `getSnapshot` |

All thin `fetch` wrappers via the existing `apiFetch` pattern.

---

## Realtime (`src/features/collaboration/services/realtimeClient.ts`)

A thin wrapper around the browser's native `EventSource` connecting to
`GET /api/projects/:projectId/stream` (research.md Decision 1). Dispatches
incoming `feature`/`layer`/`presence`/`lock`/`comment`/`notification`
events to the appropriate React Query cache invalidation (below) or
directly into `collaborationStore` (presence/lock, which are ephemeral and
don't need a full query invalidation). Reconnection is the browser's
built-in `EventSource` behavior — no hand-rolled reconnect loop (FR-018).

---

## Hooks (`src/features/collaboration/hooks/`)

| Hook | Responsibility |
|---|---|
| `useMembers(projectId)` / `useChangeRole` / `useRemoveMember` / `useTransferOwnership` | Membership management, invalidate `queryKeys.members(projectId)` |
| `useInvitations(projectId)` / `useInvite` / `useAcceptInvitation` / `useDeclineInvitation` | Invitation flow |
| `useComments(featureId)` / `useCreateComment` / `useResolveComment` / `useDeleteComment` | Comment thread, invalidated both by its own mutations and by an incoming realtime `comment` event |
| `useActivity(projectId)` | Cursor-paginated Activity History |
| `useVersions(projectId)` / `useSaveVersion` / `useRestoreVersion` / `useCompareVersions` | Version History; `useRestoreVersion`'s `onSuccess` invalidates `database`'s `queryKeys.layers`/`queryKeys.features` broadly, since a restore can change anything |
| `useNotifications()` / `useMarkNotificationRead` / `useMarkAllNotificationsRead` | Notification list + unread count |
| `useFeatureLock(featureId)` | Wraps acquire (on entering edit mode)/release (on save or cancel), integrating with 004-map-editing-ui's existing edit-mode lifecycle at its two existing entry/exit points, not a new one |
| `usePresence(projectId)` | Heartbeat interval (~10 s) + realtime-pushed presence list |
| `useOfflineQueue()` | Wraps `database`'s existing `useCreateFeature`/`useUpdateFeature`/`useDeleteFeature` mutations with an IndexedDB-backed queue-and-replay layer (research.md Decision 6) — does not duplicate their logic, decorates them |

**Query keys**: `src/features/collaboration/services/queryKeys.ts`
centralizes `members(projectId)`, `invitations(projectId)`,
`comments(featureId)`, `activity(projectId, params?)`,
`versions(projectId, params?)`, `version(versionId)`,
`notifications(params?)` — never an inline array literal.

---

## Store: `collaborationStore` (Zustand, new file)

Holds only ephemeral, non-server-cached realtime state — the parts that
change too fast/too often for React Query's cache model to be the right
fit:

| Field | Notes |
|---|---|
| `activePresence` | `Record<userId, PresenceState>` for the current project, updated directly from realtime `presence` events (not React Query — this is a live stream, not a request/response cache) |
| `activeLocks` | `Record<featureId, { lockedByUserId, expiresAt }>`, updated from realtime `lock` events |
| `connectionStatus` | `"connected" \| "reconnecting" \| "disconnected"`, driven by `EventSource`'s own `onopen`/`onerror` |
| `unreadNotificationCount` | Mirrors the durable count from `useNotifications`, updated instantly on a realtime `notification` event so the badge doesn't wait for the next poll/refetch |

This store is a sibling to `database`'s `databaseStore`/`editingStore` and
`analysis`'s `analysisStore` — a fourth, genuinely distinct concern
(live realtime state), not a duplicate of any of them.

---

## Offline Queue (`src/features/collaboration/services/offlineQueue.ts`)

A small IndexedDB wrapper (native `indexedDB` API, no new dependency)
storing `{ id, mutationType, payload, featureExpectedUpdatedAt,
status }` rows. `useOfflineQueue` drains it in order on
`window.addEventListener("online", ...)`, replaying each through the
existing mutation hooks and marking each `"submitted"` or `"conflicted"`
based on the response (research.md Decision 6).
