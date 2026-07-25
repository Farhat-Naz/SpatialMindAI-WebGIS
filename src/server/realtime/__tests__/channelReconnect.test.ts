import { EventEmitter } from "node:events"
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * A mocked `pg.Client` — testing `channel.ts`'s reconnect-with-backoff
 * (T106) against a real dropped Postgres connection would require actually
 * severing a live connection (destructive/impractical for an automated
 * test); mocking `pg` lets us simulate the drop deterministically instead.
 */
class MockClient extends EventEmitter {
  static instances: MockClient[] = []
  connect = vi.fn().mockResolvedValue(undefined)
  query = vi.fn().mockResolvedValue(undefined)

  constructor() {
    super()
    MockClient.instances.push(this)
  }
}

vi.mock("pg", () => ({
  // `Client` is used as `new Client(...)` in channel.ts — the mock must
  // itself be `new`-able (a class/regular function), not an arrow function
  // wrapped in `vi.fn().mockImplementation()`, which vitest warns about
  // and which throws "is not a constructor" when actually invoked with `new`.
  Client: MockClient,
}))

describe("realtime channel reconnect", () => {
  afterEach(() => {
    MockClient.instances = []
    vi.resetModules()
  })

  it("reconnects with a new client after the current one emits 'end'", async () => {
    vi.useFakeTimers()
    const channelModule = await import("../channel")
    channelModule.resetChannelForTests()

    const unsubscribe = await channelModule.subscribe("collab:project:reconnect-test", () => {})
    expect(MockClient.instances).toHaveLength(1)

    // Simulate an unexpected connection drop.
    MockClient.instances[0].emit("end")

    // Advance past the first backoff window (500ms base).
    await vi.advanceTimersByTimeAsync(600)

    expect(MockClient.instances.length).toBeGreaterThanOrEqual(2)
    await unsubscribe().catch(() => {})
    vi.useRealTimers()
  })

  it("re-issues LISTEN for every still-subscribed channel after reconnecting", async () => {
    vi.useFakeTimers()
    const channelModule = await import("../channel")
    channelModule.resetChannelForTests()

    await channelModule.subscribe("collab:project:relisten-test", () => {})
    const firstClient = MockClient.instances[0]
    firstClient.query.mockClear()

    firstClient.emit("end")
    await vi.advanceTimersByTimeAsync(600)

    const secondClient = MockClient.instances[1]
    expect(secondClient.query).toHaveBeenCalledWith('LISTEN "collab:project:relisten-test"')
    vi.useRealTimers()
  })
})
