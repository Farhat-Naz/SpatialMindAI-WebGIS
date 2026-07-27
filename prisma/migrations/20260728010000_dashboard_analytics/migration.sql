-- Dashboard, Reporting & Analytics (specs/008-dashboard-analytics, T029).
--
-- Entirely additive: ten new tables plus back-relation arrays on
-- Project/User (no new column on either). No existing table, column, or
-- constraint is altered (data-model.md Migration notes).
--
-- Hand-authored, not `prisma migrate dev`-generated: this dev database has
-- three PostGIS-dependent extensions (fuzzystrmatch, postgis_tiger_geocoder,
-- postgis_topology) that the `postgis` extension installs as dependencies
-- but that aren't declared in schema.prisma's `extensions = [postgis]` list.
-- `prisma migrate dev` treats their presence as drift and refuses to
-- proceed without a full `migrate reset` (which would drop all existing
-- data) — the same situation 20260727080000_add_import_jobs_and_export_scope
-- already hit and resolved the same way.

-- ---------------------------------------------------------------------------
-- CreateTable: DashboardTemplate (created first — Dashboard.templateId
-- references it).
-- ---------------------------------------------------------------------------
CREATE TABLE "DashboardTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "widgetsBlueprint" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardTemplate_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CreateTable: Dashboard
-- ---------------------------------------------------------------------------
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CreateTable: DashboardWidget — `config` covers "WidgetConfiguration"
-- (research.md Decision 1; no separate table).
-- ---------------------------------------------------------------------------
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "dataSourceType" TEXT,
    "dataSourceId" TEXT,
    "config" JSONB NOT NULL,
    "groupId" TEXT,
    "isCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CreateTable: WidgetLayout — one row per widget per breakpoint tier
-- (research.md Decision 2).
-- ---------------------------------------------------------------------------
CREATE TABLE "WidgetLayout" (
    "id" TEXT NOT NULL,
    "widgetId" TEXT NOT NULL,
    "breakpoint" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,

    CONSTRAINT "WidgetLayout_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CreateTable: DashboardShare
-- ---------------------------------------------------------------------------
CREATE TABLE "DashboardShare" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardShare_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CreateTable: DashboardFavorite
-- ---------------------------------------------------------------------------
CREATE TABLE "DashboardFavorite" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardFavorite_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CreateTable: DashboardFilter — a spatial filter's geometry is stored as
-- GeoJSON here, not a PostGIS column (data-model.md Migration notes: it is
-- always the *input* to a spatial predicate, never itself indexed).
-- ---------------------------------------------------------------------------
CREATE TABLE "DashboardFilter" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "widgetId" TEXT,
    "filterType" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardFilter_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CreateTable: ScheduledReport (created before Report — Report.scheduledReportId references it).
-- ---------------------------------------------------------------------------
CREATE TABLE "ScheduledReport" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "recurrence" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CreateTable: Report — the one table in this feature storing a file
-- server-side (research.md Decision 17).
-- ---------------------------------------------------------------------------
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledReportId" TEXT,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fileContent" BYTEA,
    "sizeBytes" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CreateTable: AnalyticsSnapshot — an upsert target, not append-only
-- (research.md Decision 12).
-- ---------------------------------------------------------------------------
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "scopeId" TEXT,
    "data" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashboardTemplate_key_key" ON "DashboardTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Dashboard_projectId_name_key" ON "Dashboard"("projectId", "name");

-- CreateIndex
CREATE INDEX "Dashboard_projectId_updatedAt_idx" ON "Dashboard"("projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "Dashboard_ownerId_idx" ON "Dashboard"("ownerId");

-- CreateIndex
CREATE INDEX "DashboardWidget_dashboardId_idx" ON "DashboardWidget"("dashboardId");

-- CreateIndex
CREATE INDEX "DashboardWidget_dashboardId_groupId_idx" ON "DashboardWidget"("dashboardId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetLayout_widgetId_breakpoint_key" ON "WidgetLayout"("widgetId", "breakpoint");

-- CreateIndex
CREATE INDEX "WidgetLayout_widgetId_idx" ON "WidgetLayout"("widgetId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardShare_dashboardId_userId_key" ON "DashboardShare"("dashboardId", "userId");

-- CreateIndex
CREATE INDEX "DashboardShare_userId_idx" ON "DashboardShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardFavorite_dashboardId_userId_key" ON "DashboardFavorite"("dashboardId", "userId");

-- CreateIndex
CREATE INDEX "DashboardFavorite_userId_idx" ON "DashboardFavorite"("userId");

-- CreateIndex
CREATE INDEX "DashboardFilter_dashboardId_idx" ON "DashboardFilter"("dashboardId");

-- CreateIndex
CREATE INDEX "DashboardFilter_widgetId_idx" ON "DashboardFilter"("widgetId");

-- CreateIndex: the run-due endpoint's core query (`WHERE isActive AND nextRunAt <= now()`).
CREATE INDEX "ScheduledReport_nextRunAt_isActive_idx" ON "ScheduledReport"("nextRunAt", "isActive");

-- CreateIndex: per-user Generated Reports list, newest first (FR-018/FR-033).
CREATE INDEX "Report_userId_createdAt_idx" ON "Report"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_dashboardId_idx" ON "Report"("dashboardId");

-- CreateIndex
CREATE INDEX "Report_scheduledReportId_idx" ON "Report"("scheduledReportId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSnapshot_projectId_snapshotType_scopeId_key" ON "AnalyticsSnapshot"("projectId", "snapshotType", "scopeId");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_projectId_snapshotType_idx" ON "AnalyticsSnapshot"("projectId", "snapshotType");

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DashboardTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: the self-relation backing US3 grouping.
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DashboardWidget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WidgetLayout" ADD CONSTRAINT "WidgetLayout_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "DashboardWidget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardFavorite" ADD CONSTRAINT "DashboardFavorite_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardFavorite" ADD CONSTRAINT "DashboardFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardFilter" ADD CONSTRAINT "DashboardFilter_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardFilter" ADD CONSTRAINT "DashboardFilter_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "DashboardWidget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledReport" ADD CONSTRAINT "ScheduledReport_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledReport" ADD CONSTRAINT "ScheduledReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_scheduledReportId_fkey" FOREIGN KEY ("scheduledReportId") REFERENCES "ScheduledReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
