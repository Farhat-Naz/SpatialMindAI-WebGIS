# Client Contracts: Services, Hooks, Store (Administration & Security)

**Feature**: 009-administration-security

Two new client feature modules, following every existing module's
`components/`, `hooks/`, `services/`, `store/`, `types/`, `__tests__/`,
`index.ts` structure:

- **`src/features/auth/`** — sign-in/sign-up/password-reset/session,
  consumed by every other feature indirectly (via the session cookie) but
  directly imported only by the app shell (sign-in page, user menu) and
  the new admin module.
- **`src/features/admin/`** — every administrative capability (US2–US10):
  user/role/permission management, audit logs, security/system settings,
  API keys, backups, monitoring.

Neither module reaches into another feature's internals — `admin`
consumes `database`'s, `analysis`'s (007), `dashboards`'s (008), and
006-collaboration's public barrels for the data it surfaces (permissions,
statistics), never their repository/service internals directly (that
distinction is server-side only, per Constitution Principle I — client
code was never allowed to import a repository anyway).

---

## `src/features/auth/services/authService.ts`

| Method | Calls |
|---|---|
| `register(input)` | `POST /api/auth/register` |
| `login(input)` | `POST /api/auth/login` |
| `logout()` | `POST /api/auth/logout` |
| `requestPasswordReset(email)` | `POST /api/auth/password-reset/request` |
| `confirmPasswordReset(token, newPassword)` | `POST /api/auth/password-reset/confirm` |
| `getSession()` | `GET /api/auth/session` |

## `src/features/auth/hooks/useAuth.ts`

| Hook | Notes |
|---|---|
| `useSession()` | Query, long `staleTime`, the one hook every authenticated page/component can use to read "who am I" — backs the app shell's user menu and route-gating alongside `middleware.ts` (research.md Decision 12) |
| `useLogin()` | Mutation; `retry: false` (an auto-retried login could double-submit against the rate limiter); on success invalidates `session()` |
| `useLogout()` | Mutation; on success invalidates `session()` and clears all cached queries (`queryClient.clear()`) — signing out must not leave another user's cached data visible to the next sign-in on a shared device |
| `useRequestPasswordReset()` / `useConfirmPasswordReset()` | Mutations |
| `useRegister()` | Mutation (only relevant if open registration is enabled, per api-contracts.md's note) |

**Query keys**: `src/features/auth/services/queryKeys.ts` — `session()`
only; this module's query surface is intentionally minimal.

## `src/features/auth/store/authStore.ts`

Session-only UI state (never the session/user data itself — that is
React Query's job per Constitution's server-state rule, identical
precedent to every prior feature).

| Field | Type | Notes |
|---|---|---|
| `lastAuthError` | `string \| null` | safe-to-display login/reset error message |
| `redirectAfterLogin` | `string \| null` | where `middleware.ts`'s redirect should return the user after a successful sign-in |

---

## `src/features/admin/services/`

### `userManagementService.ts`

| Method | Calls |
|---|---|
| `listUsers(params)` | `GET /api/admin/users` |
| `createUser(input)` | `POST /api/admin/users` |
| `updateUser(userId, input)` | `PATCH /api/admin/users/:userId` |
| `deleteUser(userId)` | `DELETE /api/admin/users/:userId` |
| `getMyProfile()` / `updateMyProfile(input)` | `GET`/`PATCH /api/users/me` |

### `roleService.ts`

`listRoles`, `createRole`, `updateRole`, `deleteRole`,
`listPermissionGroups` — thin wrappers over api-contracts.md's Role
Management endpoints.

### `permissionService.ts`

`getProjectPermissions(projectId)`, `updateProjectMemberRole(...)`,
`updateDashboardShare(...)`, `getDefaultPolicy()`,
`updateDefaultPolicy(...)` — thin wrappers.

### `auditLogService.ts`

`listAuditLog(params)`, `exportAuditLog(params)`.

### `securitySettingsService.ts`

`getSecuritySettings()`, `updateSecuritySettings(input)`.

### `apiKeyService.ts`

`listApiKeys(params?)`, `createApiKey(input)`, `rotateApiKey(keyId)`,
`updateApiKey(keyId, input)`, `revokeApiKey(keyId)`,
`getApiKeyUsage(keyId, params)`.

### `systemSettingsService.ts`

`getSystemSettings()`, `updateSystemSettings(input)`, `sendTestEmail()`.

### `backupService.ts`

`listBackups(projectId, params)`, `triggerBackup(projectId)`,
`downloadBackup(backupId)`, `restoreBackup(backupId, input)`.

### `monitoringService.ts`

`getMonitoringOverview()`.

---

## `src/features/admin/hooks/`

One hook file per service above (`useUserManagement.ts`, `useRoles.ts`,
`usePermissions.ts`, `useAuditLog.ts`, `useSecuritySettings.ts`,
`useApiKeys.ts`, `useSystemSettings.ts`, `useBackups.ts`,
`useMonitoring.ts`), each following the exact query/mutation/
cache-invalidation shape every prior feature's hooks already established
— centralized `queryKeys.ts` in `src/features/admin/services/`, no
inline key literals.

Two hooks warrant a specific note:

| Hook | Notes |
|---|---|
| `useDeleteUser()`/`useUpdateUser()` | `onError` specifically surfaces the last-Admin-protection `400` (FR-010) as a distinct, named error state in the calling component, not a generic failure toast |
| `useMonitoringOverview()` | `refetchInterval` matching 008's `useAnalyticsSnapshot` polling precedent (research.md Decision 6 in 007/008), since the health dashboard is inherently a live view |

---

## `src/features/admin/store/adminStore.ts`

Minimal — most of this module's state is server state (React Query).
The one client-only concern: which administrative section is currently
active (for a sidebar/tab-shaped admin shell), mirroring 008's
`analysisPanelStore`/`dashboardPanelStore`-style chrome-only store
precedent.

| Field | Type | Notes |
|---|---|---|
| `activeSection` | `"users" \| "roles" \| "permissions" \| "audit" \| "security" \| "apiKeys" \| "system" \| "backups" \| "monitoring"` | |

---

## Component hierarchy

```text
src/features/auth/components/
├── LoginForm
├── RegisterForm            # only rendered if open registration is enabled
├── PasswordResetRequestForm
├── PasswordResetConfirmForm
└── UserMenu                 # mounted in the app shell's Navbar (one small, existing-shell touch, same pattern 008 used for its one nav-link addition)

src/features/admin/components/
├── AdminShell                # section navigation + `adminStore.activeSection`
├── UserManagementPanel
│   ├── UserList
│   ├── UserSearchBar
│   ├── CreateUserDialog
│   └── UserProfileEditor     # also reused, in a "self" mode, for /api/users/me
├── RoleManagementPanel
│   ├── RoleList
│   └── RoleEditorDialog       # built-in roles shown read-only
├── PermissionManagementPanel
│   ├── ProjectPermissionsView
│   ├── DashboardPermissionsView
│   └── DefaultPolicyEditor
├── AuditLogPanel
│   ├── AuditLogTable
│   └── AuditLogFilterBar
├── SecuritySettingsPanel
├── ApiKeyManagementPanel
│   ├── ApiKeyList
│   ├── CreateApiKeyDialog     # shows the secret once, with an explicit "copy now, you won't see this again" warning
│   └── ApiKeyUsageView
├── SystemSettingsPanel
│   ├── GeneralSettingsForm
│   ├── StorageSettingsForm
│   ├── MapDefaultsForm
│   ├── EmailSettingsForm      # includes "Send test email"
│   └── BackupSettingsForm
├── BackupRestorePanel
│   ├── BackupHistoryList
│   ├── TriggerBackupButton
│   └── RestoreConfirmDialog   # the required-confirmation UI for FR-036/spec Edge Cases
└── MonitoringDashboard
    ├── HealthSummaryCards
    ├── StorageUsageChart      # reuses 008's ChartWidgetBase/Recharts integration, not a second charting setup
    ├── UserStatisticsChart
    └── ApiStatisticsChart
```

Every component is presentational; data fetching lives in the hooks
above, business logic (password strength feedback, secret-reveal-once
handling) in the services/components' local state, never duplicated
server-side validation logic re-implemented client-side beyond basic UX
hints (the server remains the source of truth for every rule, Constitution
Principle VI).
