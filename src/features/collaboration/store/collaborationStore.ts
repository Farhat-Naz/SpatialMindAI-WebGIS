import { create } from "zustand"

export interface PresenceState {
  userId: string
  cursorLng: number | null
  cursorLat: number | null
  viewportBounds: [number, number, number, number] | null
  currentFeatureId: string | null
  lastSeenAt: string
}

export interface LockState {
  lockedByUserId: string
  expiresAt: string
}

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected"

interface CollaborationState {
  activePresence: Record<string, PresenceState>
  activeLocks: Record<string, LockState>
  connectionStatus: ConnectionStatus
  unreadNotificationCount: number
}

interface CollaborationActions {
  setPresence: (userId: string, presence: PresenceState) => void
  removePresence: (userId: string) => void
  setLock: (featureId: string, lock: LockState) => void
  clearLock: (featureId: string) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  setUnreadCount: (count: number) => void
}

type CollaborationStore = CollaborationState & CollaborationActions

/**
 * Client-only, session-only realtime state for the collaboration feature
 * (research.md Decision 6, client-api.md) — live presence, live lock
 * state, connection status, and a live-updated unread-notification-count
 * **mirror** (React Query/`useNotifications` remains the durable source of
 * truth; this exists only so a badge doesn't wait for the next refetch).
 * Deliberately the *only* new store this feature introduces — no separate
 * comment or clipboard store exists (see tasks.md Phase 7's Scope Note);
 * neither would belong here, both already owned elsewhere (React Query and
 * `database`'s `editingStore.clipboard` respectively).
 *
 * No `persist` middleware — every field is ephemeral realtime state that
 * should not survive a reload, matching `editingStore`'s existing
 * session-only precedent. A page reload starts empty, repopulated only
 * once a fresh SSE connection/heartbeat delivers data.
 */
export const useCollaborationStore = create<CollaborationStore>()((set) => ({
  activePresence: {},
  activeLocks: {},
  connectionStatus: "disconnected",
  unreadNotificationCount: 0,

  setPresence: (userId, presence) =>
    set((state) => ({ activePresence: { ...state.activePresence, [userId]: presence } })),
  removePresence: (userId) =>
    set((state) => {
      const next = { ...state.activePresence }
      delete next[userId]
      return { activePresence: next }
    }),

  setLock: (featureId, lock) =>
    set((state) => ({ activeLocks: { ...state.activeLocks, [featureId]: lock } })),
  clearLock: (featureId) =>
    set((state) => {
      const next = { ...state.activeLocks }
      delete next[featureId]
      return { activeLocks: next }
    }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setUnreadCount: (count) => set({ unreadNotificationCount: count }),
}))
