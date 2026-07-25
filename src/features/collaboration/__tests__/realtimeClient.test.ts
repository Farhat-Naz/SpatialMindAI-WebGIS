import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { RealtimeClient } from "../services/realtimeClient"

/**
 * A minimal `EventSource` test double — jsdom has no native SSE client
 * implementation, matching this project's existing browser-only-API-
 * mocking convention (`vitest.setup.ts`'s `ResizeObserver` stub).
 */
class MockEventSource {
  static instances: MockEventSource[] = []
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2

  readyState = MockEventSource.CONNECTING
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>()

  constructor(public url: string) {
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, callback: (event: MessageEvent) => void): void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(callback)
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED
  }

  // Test helper: simulates the server emitting a named SSE event.
  emit(type: string, data: unknown): void {
    const set = this.listeners.get(type)
    if (!set) return
    const event = { data: JSON.stringify(data) } as MessageEvent
    for (const callback of set) callback(event)
  }

  simulateOpen(): void {
    this.readyState = MockEventSource.OPEN
    this.onopen?.()
  }

  simulateError(readyStateAfter: number): void {
    this.readyState = readyStateAfter
    this.onerror?.()
  }
}

describe("RealtimeClient", () => {
  beforeEach(() => {
    MockEventSource.instances = []
    // @ts-expect-error minimal test double, not a full EventSource implementation
    globalThis.EventSource = MockEventSource
  })

  afterEach(() => {
    // @ts-expect-error cleanup of the test double
    delete globalThis.EventSource
  })

  it("connects to the project's stream URL", () => {
    const client = new RealtimeClient("p1")
    client.connect()
    expect(MockEventSource.instances[0].url).toBe("/api/projects/p1/stream")
  })

  it("dispatches an incoming typed event to registered callbacks", () => {
    const client = new RealtimeClient("p1")
    client.connect()
    const received: unknown[] = []
    client.onEvent("comment", (payload) => received.push(payload))

    MockEventSource.instances[0].emit("comment", { featureId: "f1" })

    expect(received).toEqual([{ featureId: "f1" }])
  })

  it("does not dispatch an event to a callback registered for a different type", () => {
    const client = new RealtimeClient("p1")
    client.connect()
    const received: unknown[] = []
    client.onEvent("lock", (payload) => received.push(payload))

    MockEventSource.instances[0].emit("comment", { featureId: "f1" })

    expect(received).toHaveLength(0)
  })

  it("unsubscribe stops further dispatch to that callback", () => {
    const client = new RealtimeClient("p1")
    client.connect()
    const received: unknown[] = []
    const unsubscribe = client.onEvent("comment", (payload) => received.push(payload))

    unsubscribe()
    MockEventSource.instances[0].emit("comment", { featureId: "f1" })

    expect(received).toHaveLength(0)
  })

  it("reports connection status transitions: connected on open, reconnecting/disconnected on error", () => {
    const client = new RealtimeClient("p1")
    client.connect()
    const statuses: string[] = []
    client.onStatusChange((status) => statuses.push(status))

    MockEventSource.instances[0].simulateOpen()
    MockEventSource.instances[0].simulateError(MockEventSource.CONNECTING)
    MockEventSource.instances[0].simulateError(MockEventSource.CLOSED)

    expect(statuses).toEqual(["connected", "reconnecting", "disconnected"])
  })

  it("close() closes the EventSource and reports disconnected", () => {
    const client = new RealtimeClient("p1")
    client.connect()
    const statuses: string[] = []
    client.onStatusChange((status) => statuses.push(status))

    client.close()

    expect(MockEventSource.instances[0].readyState).toBe(MockEventSource.CLOSED)
    expect(statuses).toEqual(["disconnected"])
  })

  it("a second connect() call is a no-op while already open", () => {
    const client = new RealtimeClient("p1")
    client.connect()
    client.connect()
    expect(MockEventSource.instances).toHaveLength(1)
  })
})
