"use client"

import { useParams } from "next/navigation"
import { DashboardAdminPanel } from "@/features/dashboards/components/DashboardAdminPanel"

/** `GET /projects/:projectId/dashboards/admin` — mounts `DashboardAdminPanel` (US10/T284–T288). */
export default function ProjectDashboardAdminPage() {
  const { projectId } = useParams<{ projectId: string }>()

  return <DashboardAdminPanel projectId={projectId} />
}
