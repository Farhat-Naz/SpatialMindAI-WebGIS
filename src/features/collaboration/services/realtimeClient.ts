export type RealtimeEventType =
  | "feature"
  | "layer"
  | "presence"
  | "lock"
  | "comment"
  | "notification"
  | "member"
export type RealtimeConnectionStatus = "connected" | "reconnecting" | "disconnected"

type EventCallback = (payload: unknown) => void
type StatusCallback = (status: RealtimeConnectionStatus) => void

/**
 * Thin wrapper around the native `EventSource` API, connecting to
 * `GET /api/projects/:projectId/stream` (research.md Decisions 1–2).
 * Reconnection is `EventSource`'s own native behavior (FR-018) — no
 * hand-rolled reconnect loop here. Dispatches incoming typed events to
 * registered callbacks and surfaces connection-status transitions for
 * `collaborationStore` to consume.
 */
export class RealtimeClient {
  private eventSource: EventSource | null = null
  private readonly eventCallbacks = new Map<RealtimeEventType, Set<EventCallback>>()
  private readonly statusCallbacks = new Set<StatusCallback>()

  constructor(private readonly projectId: string) {}

  /** Opens the SSE connection. Safe to call once; a second call is a no-op while already open. */
  connect(): void {
    if (this.eventSource) return

    const source = new EventSource(`/api/projects/${this.projectId}/stream`)
    this.eventSource = source

    source.onopen = () => this.emitStatus("connected")
    source.onerror = () => {
      // EventSource auto-reconnects on its own; a still-CONNECTING readyState
      // after an error means it's in the middle of doing so.
      this.emitStatus(source.readyState === EventSource.CONNECTING ? "reconnecting" : "disconnected")
    }

    const eventTypes: RealtimeEventType[] = [
      "feature",
      "layer",
      "presence",
      "lock",
      "comment",
      "notification",
      "member",
    ]
    for (const type of eventTypes) {
      source.addEventListener(type, (event: MessageEvent) => {
        let payload: unknown = event.data
        try {
          payload = JSON.parse(event.data)
        } catch {
          // Leave as the raw string — a malformed payload should not crash dispatch.
        }
        const callbacks = this.eventCallbacks.get(type)
        if (callbacks) {
          for (const callback of callbacks) callback(payload)
        }
      })
    }
  }

  /** Registers `callback` for every event of `type`. Returns an unsubscribe function. */
  onEvent(type: RealtimeEventType, callback: EventCallback): () => void {
    let callbacks = this.eventCallbacks.get(type)
    if (!callbacks) {
      callbacks = new Set()
      this.eventCallbacks.set(type, callbacks)
    }
    callbacks.add(callback)
    return () => callbacks!.delete(callback)
  }

  /** Registers `callback` for connection-status transitions. Returns an unsubscribe function. */
  onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback)
    return () => this.statusCallbacks.delete(callback)
  }

  private emitStatus(status: RealtimeConnectionStatus): void {
    for (const callback of this.statusCallbacks) callback(status)
  }

  /** Closes the SSE connection. */
  close(): void {
    this.eventSource?.close()
    this.eventSource = null
    this.emitStatus("disconnected")
  }
}

const clientsByProject = new Map<string, RealtimeClient>()

/**
 * Returns the one shared `RealtimeClient` for `projectId`, creating and
 * connecting it on first call — every hook needing realtime events for the
 * same open project (`useRealtimeInvalidation`, `collaborationStore`'s
 * connection-status wiring, `usePresence`) shares this single `EventSource`
 * connection rather than each opening its own.
 */
export function getRealtimeClient(projectId: string): RealtimeClient {
  let client = clientsByProject.get(projectId)
  if (!client) {
    client = new RealtimeClient(projectId)
    client.connect()
    clientsByProject.set(projectId, client)
  }
  return client
}

/** Closes and forgets the shared client for `projectId` (e.g., when navigating away from the project). */
export function closeRealtimeClient(projectId: string): void {
  clientsByProject.get(projectId)?.close()
  clientsByProject.delete(projectId)
}
