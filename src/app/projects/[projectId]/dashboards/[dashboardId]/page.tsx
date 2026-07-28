"use client"

import { useParams } from "next/navigation"
import { DashboardView } from "@/features/dashboards/components/DashboardView"

/** `GET /projects/:projectId/dashboards/:dashboardId` — mounts `DashboardView` (T135/T275). */
export default function ProjectDashboardDetailPage() {
  const { projectId, dashboardId } = useParams<{ projectId: string; dashboardId: string }>()

  return <DashboardView projectId={projectId} dashboardId={dashboardId} />
}
