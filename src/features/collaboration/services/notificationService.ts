import type { Notification } from "@/shared/contracts/notification.schema"
import { apiFetch } from "./apiFetch"

/** Client-side fetch wrappers for the notification API (FR-036–FR-038). */
export const notificationService = {
  listNotifications(params?: {
    cursor?: string
    limit?: number
    unreadOnly?: boolean
  }): Promise<{ notifications: Notification[]; nextCursor: string | null; unreadCount: number }> {
    const query = new URLSearchParams()
    if (params?.cursor) query.set("cursor", params.cursor)
    if (params?.limit) query.set("limit", String(params.limit))
    if (params?.unreadOnly) query.set("unreadOnly", "true")
    const suffix = query.toString() ? `?${query.toString()}` : ""
    return apiFetch(`/api/notifications${suffix}`)
  },
  markRead(notificationId: string): Promise<{ notification: Notification }> {
    return apiFetch(`/api/notifications/${notificationId}/read`, { method: "PATCH" })
  },
  markAllRead(): Promise<{ updatedCount: number }> {
    return apiFetch("/api/notifications/mark-all-read", { method: "POST" })
  },
}
