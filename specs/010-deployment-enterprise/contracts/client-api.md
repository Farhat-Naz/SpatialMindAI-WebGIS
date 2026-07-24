# Client API Contracts: Enterprise Deployment & Production Operations

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

New client feature module: `src/features/operations/`, following the exact
internal structure Constitution Principle I requires and every existing
feature module already uses (`components/`, `hooks/`, `services/`,
`store/`, `types/`, `__tests__/`, `index.ts` barrel). This is a distinct
module from `009`'s planned `src/features/admin/` for the same reason `009`
itself split `auth`/`admin` apart: operations (deployments, releases,
maintenance, diagnostics) has a different audience-and-concern shape than
identity/RBAC administration, even though both are operator-only surfaces.

## `services/opsService.ts`

Thin `fetch` wrappers over `contracts/api-contracts.md`'s endpoints,
following the existing service-layer convention (e.g.
`src/features/dashboard/services/*`) — no direct Route Handler or Prisma
access from any client code (Constitution Principle I).

```ts
getSystemStatus(): Promise<SystemStatusResponse>
getDiagnostics(): Promise<DiagnosticsResponse>
listDeployments(environment?: Environment): Promise<DeploymentSummary[]>
listDeploymentEvents(deploymentId: string): Promise<DeploymentEvent[]>
rollbackDeployment(deploymentId: string): Promise<DeploymentSummary>
listReleases(): Promise<ReleaseSummary[]>
listBackupJobs(environment?: Environment): Promise<BackupJobSummary[]>
listBackupHistory(backupJobId: string): Promise<BackupHistoryEntry[]>
requestRestore(backupJobId: string, backupHistoryId: string): Promise<{ status: string }>
getMaintenanceStatus(): Promise<MaintenanceWindowSummary | null>
activateMaintenance(reason: string, notifyMessage?: string): Promise<MaintenanceWindowSummary>
deactivateMaintenance(id: string): Promise<MaintenanceWindowSummary>
listNotifications(filter?: NotificationFilter): Promise<NotificationSummary[]>
acknowledgeNotification(id: string): Promise<NotificationSummary>
queryLogs(filter: LogFilter): Promise<{ entries: LogEntrySummary[]; nextCursor: string | null }>
queryMetrics(metricName: string, from?: string, to?: string): Promise<MetricSamplesResponse>
validateConfig(): Promise<ConfigValidationResponse>
```

## `services/queryKeys.ts`

Centralized React Query key factory, mirroring every existing feature's
`queryKeys.ts` (Constitution Principle V):

```ts
export const opsKeys = {
  status: () => ["ops", "status"] as const,
  diagnostics: () => ["ops", "diagnostics"] as const,
  deployments: (environment?: string) => ["ops", "deployments", environment] as const,
  deploymentEvents: (id: string) => ["ops", "deployments", id, "events"] as const,
  releases: () => ["ops", "releases"] as const,
  backupJobs: (environment?: string) => ["ops", "backups", environment] as const,
  backupHistory: (jobId: string) => ["ops", "backups", jobId, "history"] as const,
  maintenance: () => ["ops", "maintenance"] as const,
  notifications: (filter?: object) => ["ops", "notifications", filter] as const,
  logs: (filter?: object) => ["ops", "logs", filter] as const,
  metrics: (name: string, from?: string, to?: string) => ["ops", "metrics", name, from, to] as const,
}
```

## `hooks/`

- `useSystemStatus()` — `useQuery`, `refetchInterval: 30_000` (dashboard
  auto-refresh, SC-018's "under 1 minute" budget).
- `useDiagnostics()` — `useQuery`, manual `refetch` trigger (on-demand per
  FR-050, not polled).
- `useDeployments(environment?)` / `useDeploymentEvents(id)` — `useQuery`.
- `useRollbackDeployment()` — `useMutation`, invalidates
  `opsKeys.deployments()` on success.
- `useReleases()` — `useQuery`.
- `useBackupJobs(environment?)` / `useBackupHistory(jobId)` — `useQuery`.
- `useRequestRestore()` — `useMutation`, requires explicit confirmation
  (component-level `AlertDialog`, reusing `src/shared/components/ui/alert-dialog.tsx`)
  before calling — a destructive action.
- `useMaintenanceStatus()` — `useQuery`, `refetchInterval: 15_000` (operators
  need to see state changes quickly during an active window).
- `useActivateMaintenance()` / `useDeactivateMaintenance()` — `useMutation`,
  invalidate `opsKeys.maintenance()`.
- `useNotifications(filter?)` — `useQuery`.
- `useAcknowledgeNotification()` — `useMutation`, invalidates
  `opsKeys.notifications()`.
- `useLogs(filter)` — `useQuery`, cursor-paginated (`useInfiniteQuery`,
  matching `009`'s planned audit-log pagination approach).
- `useMetrics(name, from?, to?)` — `useQuery`, feeds chart components.

## `store/operationsStore.ts` (Zustand)

Client-only UI state — never a shadow cache of server data (Constitution's
State Management standard): selected environment filter, log
search/filter draft, active dashboard tab.

```ts
interface OperationsUIState {
  selectedEnvironment: Environment | "ALL"
  logFilterDraft: { category?: LogCategory; level?: LogLevel }
  activeTab: "overview" | "deployments" | "backups" | "logs" | "maintenance"
  setSelectedEnvironment(env: Environment | "ALL"): void
  setLogFilterDraft(filter: Partial<OperationsUIState["logFilterDraft"]>): void
  setActiveTab(tab: OperationsUIState["activeTab"]): void
}
```

## `components/` (new, under `src/features/operations/components/`)

- `OperationsDashboard.tsx` — top-level layout, tab navigation (FR-047,
  FR-050).
- `SystemStatusPanel.tsx` — component health cards (`HealthCheck` per
  component), auto-refreshing.
- `DeploymentHistoryPanel.tsx` + `DeploymentEventsTimeline.tsx` — release/
  deploy history and per-deployment event timeline (FR-047, FR-048).
- `RollbackConfirmDialog.tsx` — reuses `shared/components/ui/alert-dialog.tsx`
  (FR-015).
- `BackupManagementPanel.tsx` — job list, history, restore action with
  confirmation (FR-025–FR-028).
- `MaintenanceModePanel.tsx` — activate/deactivate toggle, active-window
  banner (FR-049).
- `DiagnosticsPanel.tsx` — on-demand diagnostics report (FR-050).
- `NotificationsPanel.tsx` — alert list, acknowledge action (FR-018).
- `LogExplorer.tsx` — filterable, paginated centralized log view (FR-023).
- `MetricsChart.tsx` — reuses the charting library `008-dashboard-analytics`
  already introduced (Recharts, per `009`'s plan precedent — no second
  charting library added).

All interactive controls use `shadcn/ui` primitives already vendored under
`src/shared/components/ui/` (`alert-dialog`, `alert`, `toggle`, `slider`
already present per the current `git status`), satisfying the Accessibility
standard without introducing new UI primitives.

## Navigation

`src/features/dashboard/components/Navbar.tsx` gains one new nav entry
("Operations", visible to authorized operators only) — the same
single-line, additive touch `009`'s plan already documented for its own
`UserMenu` addition to this one shared shell component.
