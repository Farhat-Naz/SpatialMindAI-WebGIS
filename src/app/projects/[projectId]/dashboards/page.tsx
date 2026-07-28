"use client"

import { useParams, useRouter } from "next/navigation"
import { DashboardListPage } from "@/features/dashboards/components/DashboardListPage"

/** `GET /projects/:projectId/dashboards` — mounts `DashboardListPage` (T126/T275). */
export default function ProjectDashboardsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const router = useRouter()

  return (
    <DashboardListPage
      projectId={projectId}
      onOpenDashboard={(dashboardId) => router.push(`/projects/${projectId}/dashboards/${dashboardId}`)}
    />
  )
}
