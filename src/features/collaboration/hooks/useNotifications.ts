"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { notificationService } from "../services/notificationService"
import { queryKeys } from "../services/queryKeys"

/** Lists the caller's own notifications (plus `unreadCount`). */
export function useNotifications(params?: { cursor?: string; limit?: number; unreadOnly?: boolean }) {
  return useQuery({
    queryKey: queryKeys.notifications(params),
    queryFn: () => notificationService.listNotifications(params),
  })
}

/** Marks one notification read and invalidates the notification list on success. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) => notificationService.markRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

/** Marks every notification read and invalidates the notification list on success. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}
