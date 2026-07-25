import { describe, expect, it, beforeEach } from "vitest"
import { isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { publish, projectChannel, resetChannelForTests, subscribe } from "../channel"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("realtime channel", () => {
  beforeEach(() => {
    resetChannelForTests()
  })

  it("delivers a published event to a subscriber on the same channel", async () => {
    const channel = projectChannel(`test-${Date.now()}`)
    const received: unknown[] = []

    const unsubscribe = await subscribe(channel, (payload) => {
      received.push(payload)
    })

    await publish(channel, { type: "feature", action: "create" })
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ type: "feature", action: "create" })

    await unsubscribe()
  })

  it("does not deliver events on a different channel", async () => {
    const channelA = projectChannel(`test-a-${Date.now()}`)
    const channelB = projectChannel(`test-b-${Date.now()}`)
    const received: unknown[] = []

    const unsubscribe = await subscribe(channelA, (payload) => received.push(payload))
    await publish(channelB, { type: "feature", action: "create" })
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(received).toHaveLength(0)
    await unsubscribe()
  })

  it("stops delivering events after unsubscribe", async () => {
    const channel = projectChannel(`test-unsub-${Date.now()}`)
    const received: unknown[] = []

    const unsubscribe = await subscribe(channel, (payload) => received.push(payload))
    await unsubscribe()
    await publish(channel, { type: "feature", action: "create" })
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(received).toHaveLength(0)
  })

  it("rejects an invalid channel name (SQL-injection defense-in-depth)", async () => {
    await expect(publish('bad"; DROP TABLE "User"; --', {})).rejects.toThrow(
      "Invalid realtime channel name",
    )
  })
})
