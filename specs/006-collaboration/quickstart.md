# Quickstart Validation Guide: Real-Time Collaboration

**Feature**: 006-collaboration
**Date**: 2026-07-23

Validates this feature once `/speckit-implement` has completed its tasks.
Assumes 003/004/005 are already implemented and passing their own
quickstarts, and that at least two seeded users exist to act as
collaborators (the existing single-`DEV_USER_ID` seam, 003-database-
foundation Research Decision 6, needs a second seeded user id for these
scenarios — see Risks in `plan.md`).

## Prerequisites

- 003, 004, 005 fully implemented; dev server running; database migrated
- Two seeded users (`DEV_USER_ID` and a second test user id) to exercise
  multi-user scenarios
- Two browser sessions/tabs (or two browser profiles) to observe live
  updates between "member A" and "member B"

## 1. Build & Quality Gates

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

## 2. Project Sharing (US1)

1. As Owner, invite member B as Editor. **Expected**: B gains access;
   appears in the member list with role Editor.
2. As Owner, downgrade B to Viewer. **Expected**: B's next write attempt
   is rejected (`403`).
3. As B (Editor), attempt to invite a third user or transfer ownership.
   **Expected**: both rejected (`403`) — only the Owner manages
   membership/ownership (US1 scenarios 5–6).
4. As Owner, transfer ownership to B. **Expected**: B is now Owner; the
   original Owner is now an Editor, never locked out.

## 3. Real-Time Collaboration (US2)

1. With both sessions open on the same project, member A draws a
   feature. **Expected**: it appears on member B's map within a few
   seconds, no refresh.
2. Member A renames a layer. **Expected**: B's Layer Tree updates live.
3. Disconnect member A's network briefly, then restore it. **Expected**:
   a "reconnecting" indicator appears, then automatic resync with no
   manual reload.

## 4. Feature Locking (US3)

1. Member A enters edit mode on a feature. **Expected**: B sees a lock
   indicator naming A; B's attempt to edit the same feature is rejected.
2. Member A saves. **Expected**: the lock releases immediately; B can now
   edit it.
3. Leave a feature locked and idle past the timeout (Assumptions — 15
   min). **Expected**: the lock releases automatically.

## 5. Activity History (US4)

1. Perform a create, an edit, and a share action. **Expected**: all three
   appear in Activity History, newest first, each with the correct user/
   timestamp/action/target.

## 6. Version History (US5)

1. Save a version with a note. **Expected**: appears in the version list.
2. Import a GeoJSON file (004-map-editing-ui). **Expected**: a version is
   auto-saved immediately beforehand, with no action from the member.
3. Make a further edit, then restore the earlier version. **Expected**:
   project reverts; the intervening edit's version is still present in
   history (not deleted); a new "pre-restore" version now exists too.

## 7. Comments (US6)

1. Member A comments on a feature, mentioning member B. **Expected**: B
   sees the comment and receives a mention notification (US7).
2. B replies; A resolves the thread. **Expected**: the thread shows
   resolved but both comments remain visible.

## 8. Notifications (US7)

1. After Section 7's mention, B checks their notification list.
   **Expected**: the mention appears, unread count reflects it.
2. B marks it read. **Expected**: unread count decreases accordingly.

## 9. Offline Editing (US8)

1. Disconnect a client entirely (e.g., devtools "offline" mode), edit a
   feature. **Expected**: the edit is accepted locally, not lost.
2. Reconnect. **Expected**: the edit is automatically submitted with no
   further action.
3. Repeat step 1, but have a second session edit/delete the same feature
   first, then reconnect the offline client. **Expected**: the conflict
   is surfaced to the offline member for resolution — neither version is
   silently discarded.

## 10. Presence (US9)

1. With two sessions open, each views the other listed as active, with
   an approximate cursor/map view.
2. Close one session. **Expected**: that member's presence disappears
   for the other within ~30 seconds — not instantly, not indefinitely.

## 11. Security Spot-Check

1. A user with no membership on a project attempts any endpoint in
   `contracts/api-contracts.md`. **Expected**: `404` for every one, never
   a `401`/`403` that would disclose the project's existence.
2. A Viewer attempts any write endpoint. **Expected**: `403 FORBIDDEN`,
   consistent across every endpoint.

## 12. Performance Spot-Check

1. With ~100 simulated concurrent SSE connections open on one project
   (a load-test script, not manual), confirm the server remains
   responsive and SC-002's 5-second propagation budget holds.
2. Confirm Activity History, Comments, Notifications, and Version History
   all remain responsive when seeded with a large (10,000+ row) history.

## Production Readiness Checklist

- [ ] All nine user stories match their `spec.md` acceptance scenarios
- [ ] No conflict (lock or offline) is ever silently resolved — every one
      surfaces to the affected member
- [ ] Every Activity/Comment/Version row's attribution survives even a
      (hypothetical, since user deletion doesn't exist yet) removed user
- [ ] Cross-member and insufficient-role requests return the correct,
      non-disclosing status code in every case
- [ ] SSE reconnection is verified to work with no manual reload
- [ ] `tsc --noEmit`, `eslint`, full test suite, and `next build` all pass
