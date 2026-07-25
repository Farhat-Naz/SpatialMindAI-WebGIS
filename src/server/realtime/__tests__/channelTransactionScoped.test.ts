import { describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { publish, resetChannelForTests, subscribe } from "../channel"

const dbAvailable = await isDatabaseAvailable()

/**
 * Postgres defers a `NOTIFY` issued inside a transaction until that
 * transaction commits (`channel.ts`'s `publish` doc) — this verifies that
 * guarantee end-to-end rather than just against the non-transactional path
 * already covered by `channel.test.ts`.
 */
describe.skipIf(!dbAvailable)("channel transaction-scoped publish", () => {
  it(
    "delivers a transaction-scoped publish only after commit",
    async () => {
      resetChannelForTests()
      const channel = `collab:project:txscoped${Date.now()}`
      let received: unknown = null

      const unsubscribe = await subscribe(channel, (payload) => {
        received = payload
      })

      await prismaClient.$transaction(async (tx) => {
        await publish(channel, { type: "debug", hello: "world" }, tx)
        expect(received).toBeNull()
      })

      await new Promise<void>((resolve) => {
        const check = () => {
          if (received) {
            resolve()
          } else {
            setTimeout(check, 50)
          }
        }
        check()
      })

      await unsubscribe()
      expect(received).toEqual({ type: "debug", hello: "world" })
    },
    15000,
  )
})
