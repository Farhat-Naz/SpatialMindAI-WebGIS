# Quickstart: Validating Administration & Security (009)

**Prerequisites**: A running dev environment (PostGIS instance, `.env`
configured with `ADMIN_SECRETS_ENCRYPTION_KEY` and `CRON_SECRET`, SMTP
settings configured or a local mail-catcher like Mailhog for testing
email flows), this feature's migration + seed applied (the bootstrap
Admin account, four built-in `SystemRole`s, and the `PermissionGroup`
catalog — research.md Decision 18), the app running (`npm run dev`), and
a second seeded non-Admin user for permission-boundary testing.

This guide exercises each capability area through the UI; every scenario
has a matching automated test (see plan.md's Testing Strategy).

---

## 1. Authentication (US1)

1. Sign in as the seeded bootstrap Admin with correct credentials.
   **Expect**: successful sign-in, landing in the application.
2. Sign out, attempt sign-in with the wrong password. **Expect**:
   rejected with a message that doesn't reveal whether the email exists.
3. Request a password reset for the Admin's email. **Expect**: a reset
   email arrives (or is visible in the local mail-catcher); the link
   lets you set a new password; the old password no longer works.
4. Sign in with "remember me" checked, close and reopen the browser.
   **Expect**: still signed in. Repeat without "remember me." **Expect**:
   session ends with the browser session.
5. Lower `SecuritySettings.sessionTimeoutMinutes` to a short value (e.g.,
   1 minute) via Security Settings, wait past it, interact again.
   **Expect**: required to sign in again.
6. Sign out explicitly. **Expect**: the session is immediately invalid
   (confirm a direct API call with the old cookie now returns `401`).

## 2. User Management (US2)

1. As Admin, create a new user with the Editor system role. **Expect**:
   account created; the new user can complete sign-in via the emailed
   setup link.
2. Search the user list by partial name/email. **Expect**: matching
   results returned quickly.
3. Deactivate the new user. **Expect**: they can no longer sign in; if
   they had an active session, it's invalidated immediately.
4. Reactivate them. **Expect**: they can sign in again.
5. Delete the user. **Expect**: they can no longer sign in and disappear
   from the active user list; their historical attribution elsewhere in
   the platform (if any) remains intact.
6. As any signed-in user, open your own profile, update your name and
   change your password. **Expect**: changes persist; the old password
   stops working.

## 3. Role Management (US3)

1. As Admin, assign a user the Manager system role. **Expect**: they can
   access User Management and Audit Logs but not System Settings or
   Backup & Restore.
2. Assign a user the Editor or Viewer system role. **Expect**: no
   administrative navigation is visible to them at all.
3. Create a custom role selecting a specific subset of permission groups
   (e.g., only `view_audit_logs` + `view_monitoring`). **Expect**: a user
   assigned this role can access exactly those two areas, nothing else.
4. Attempt to delete a role currently assigned to a user. **Expect**:
   blocked with a clear message; reassign the user first, then delete
   succeeds.

## 4. Permission Management (US4)

1. Open the permission management view for an existing project.
   **Expect**: every project member's role is visible and editable,
   matching what the Collaboration feature's own member list shows.
2. Open the same project's dashboard permissions. **Expect**: every
   dashboard share (view/edit, public/private) is visible and revocable
   from here without opening each dashboard individually.
3. Change the default permission policy, then create a new project.
   **Expect**: the new project starts with the updated default policy.

## 5. Audit Logs (US5)

1. Perform a sign-in, a role change, and a deactivation (from prior
   sections). Open the Audit Log. **Expect**: all three appear with
   correct who/what/when, and the deactivation/role-change are tagged as
   distinct from routine activity.
2. Perform a project action (e.g., rename a layer) elsewhere in the app.
   **Expect**: it appears in the same platform-wide audit view (sourced
   from the existing Activity feed), not duplicated as a second entry.
3. Filter by date range and category, then export. **Expect**: a
   downloadable file containing exactly the filtered entries.

## 6. Security Settings (US6)

1. Set a strict password policy (e.g., minimum 16 characters). Attempt
   to set a shorter password. **Expect**: rejected with a specific
   message.
2. Lower the sign-in rate limit to a small number, then exceed it with
   rapid failed attempts. **Expect**: further attempts rejected for a
   cooldown period.
3. Add your own current IP to the deny list (in a disposable test
   environment only). **Expect**: your next request is rejected before
   authentication runs; remove it via the documented recovery path.
4. Confirm any of the above changes appear in the Audit Log.

## 7. API Key Management (US7)

1. Create an API key scoped to read-only access. **Expect**: the secret
   is shown once; confirm it's not retrievable again from the UI.
2. Make an allowed read request with the key. **Expect**: succeeds.
   Attempt a write request. **Expect**: rejected.
3. Rotate the key. **Expect**: a new secret is issued; the old one stops
   working immediately; usage history is preserved under the same key
   identity.
4. Set a short expiration, wait past it, use the key. **Expect**:
   rejected.
5. View the key's usage log. **Expect**: recent requests are listed.

## 8. System Settings (US8)

1. Change the platform name and confirm it's reflected in the UI.
2. Set a per-project storage limit, then (in a test project) exceed it.
   **Expect**: further storage-consuming actions are blocked, and the
   Dashboard & Analytics storage widget reflects the configured cap.
3. Change the default map center/zoom, create a new project. **Expect**:
   it opens to the new default.
4. Configure SMTP settings and send a test email. **Expect**: it arrives
   (or appears in the local mail-catcher).

## 9. Backup & Restore (US9)

1. Trigger an on-demand backup of a test project. **Expect**: a complete
   backup appears in its history.
2. Download it. **Expect**: a complete, self-contained export file.
3. Make a change to the project (e.g., add a feature), then restore from
   the earlier backup. **Expect**: warned that this will overwrite
   current data, requiring explicit confirmation; after confirming, the
   project's data matches the backup's point-in-time state.
4. Configure a backup schedule (US8), then manually trigger
   `POST /api/backups/scheduled/run-due` in a test environment.
   **Expect**: a scheduled-trigger backup is created.

## 10. Monitoring (US10)

1. Open the health dashboard. **Expect**: current storage usage,
   active/total user counts, and a performance indicator are shown,
   matching the actual current state.
2. View API statistics. **Expect**: aggregate request volume/error rate
   over a recent window.
3. View user statistics. **Expect**: sign-in activity trend shown.
4. Push a monitored metric near its configured threshold (e.g., storage
   near its cap from step 8.2). **Expect**: visually flagged.

---

## Failure / recovery scenarios

1. **Bootstrap**: on a fresh environment with zero users, confirm the
   documented bootstrap path (seed script or first-run environment
   variable) is the only way an Admin account comes to exist — no
   implicit "first registrant becomes Admin" behavior.
2. **Last-Admin protection**: attempt to deactivate, delete, or
   role-change away the platform's only remaining Admin. **Expect**:
   blocked with a clear message in every case.
3. **Deactivation mid-session**: deactivate a user while they have the
   app open in another browser/session. **Expect**: their very next
   request (not just their next sign-in attempt) fails.
4. **Expired/reused reset token**: use a password-reset link twice, or
   after it has expired. **Expect**: rejected both times with a clear
   message; the password is not changed.
5. **Downgraded API key owner**: create an API key as a user with broad
   permissions, then downgrade that user's role, then use the key.
   **Expect**: the key's effective access reflects the *new*, narrower
   permissions immediately — not what it had at creation time.
6. **Failed restore**: attempt to restore from a deliberately corrupted
   backup file. **Expect**: the restore fails cleanly and the target
   project's data is completely unchanged — verified, not just assumed.
7. **IP lockout recovery**: after step 6.3's test, confirm the documented
   break-glass recovery path actually restores administrative access
   without requiring direct database intervention.

If every scenario above behaves as described, the feature satisfies its
spec's Acceptance Scenarios end-to-end.
