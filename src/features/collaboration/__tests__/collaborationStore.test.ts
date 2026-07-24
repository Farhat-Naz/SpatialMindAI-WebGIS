import { describe, expect, it } from "vitest"
import { useCollaborationStore } from "../store/collaborationStore"

const presence = {
  userId: "u1",
  cursorLng: 1,
  cursorLat: 2,
  viewportBounds: null,
  currentFeatureId: null,
  lastSeenAt: "t",
}
const lock = { lockedByUserId: "u1", expiresAt: "t" }

describe("collaborationStore", () => {
  it("starts empty/disconnected (session-only, no persist middleware)", () => {
    const state = useCollaborationStore.getState()
    expect(state.activePresence).toEqual({})
    expect(state.activeLocks).toEqual({})
    expect(state.connectionStatus).toBe("disconnected")
    expect(state.unreadNotificationCount).toBe(0)
  })

  it("sets and removes presence, keyed by userId", () => {
    useCollaborationStore.getState().setPresence("u1", presence)
    expect(useCollaborationStore.getState().activePresence.u1).toEqual(presence)

    useCollaborationStore.getState().removePresence("u1")
    expect(useCollaborationStore.getState().activePresence.u1).toBeUndefined()
  })

  it("sets and clears a lock, keyed by featureId", () => {
    useCollaborationStore.getState().setLock("f1", lock)
    expect(useCollaborationStore.getState().activeLocks.f1).toEqual(lock)

    useCollaborationStore.getState().clearLock("f1")
    expect(useCollaborationStore.getState().activeLocks.f1).toBeUndefined()
  })

  it("updates connection status", () => {
    useCollaborationStore.getState().setConnectionStatus("reconnecting")
    expect(useCollaborationStore.getState().connectionStatus).toBe("reconnecting")
  })

  it("updates the unread notification count mirror", () => {
    useCollaborationStore.getState().setUnreadCount(5)
    expect(useCollaborationStore.getState().unreadNotificationCount).toBe(5)
  })
})
