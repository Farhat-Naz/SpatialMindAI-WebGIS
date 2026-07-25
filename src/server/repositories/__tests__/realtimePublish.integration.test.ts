import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { updateFeature } from "@/server/repositories/featureRepository"
import { createComment } from "@/server/repositories/commentRepository"
import { acquireOrRefreshLock } from "@/server/repositories/featureLockRepository"
import { upsertPresence } from "@/server/repositories/presenceRepository"
import { changeMemberRole } from "@/server/repositories/membershipRepository"
import { projectChannel, resetChannelForTests, subscribe, userChannel } from "@/server/realtime/channel"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

/** Real DB round trips (project/member/layer/feature setup, a fresh LISTEN connection, the mutation's own transaction) add up past vitest's 5000ms default — every test here gets explicit headroom. */
const TEST_TIMEOUT_MS = 15000

/**
 * Integration tier (T119) verifying the actual write→publish wiring from
 * Phase 8 (T108–T113) — each mutation is expected to publish exactly one
 * realtime event on its project's channel (or the recipient's personal
 * channel for notifications), not zero and not more than one.
 */
describe.skipIf(!dbAvailable)("realtime publish() wiring", () => {
  let projectId: string
  let featureId: string

  beforeEach(async () => {
    resetChannelForTests()
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Realtime Wiring Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" },
    })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L1", order: 0 } })
    const rows = await prismaClient.$queryRaw<{ id: string }[]>`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layer.id}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
      RETURNING id
    `
    featureId = rows[0].id
  }, TEST_TIMEOUT_MS)

  // Returns a *thunk* rather than the event promise itself: an async
  // function `return`ing a promise auto-flattens it (Promise/A+ thenable
  // resolution), which would make `await collectOne(...)` block until the
  // event actually arrives — deadlocking every test here, since the event
  // is only published *after* this resolves. Wrapping in `() => eventPromise`
  // sidesteps the flattening.
  async function collectOne(channel: string): Promise<() => Promise<unknown>> {
    let resolveFn: (payload: unknown) => void
    const eventPromise = new Promise<unknown>((resolve) => {
      resolveFn = resolve
    })
    // Must await `subscribe()` fully (it issues a real `LISTEN` over the
    // connection) before returning — otherwise the caller's subsequent
    // `publish()` can race ahead of the subscription actually being
    // registered.
    await subscribe(channel, (payload) => resolveFn(payload))
    return () => eventPromise
  }

  it(
    "updateFeature publishes exactly one 'feature' event",
    async () => {
      const getEvent = await collectOne(projectChannel(projectId))
      await updateFeature(featureId, TEST_OWNER_ID, { attributes: [{ key: "k", value: "v" }] })
      const event = (await Promise.race([
        getEvent(),
        new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
      ])) as { type: string; action: string } | null
      expect(event).not.toBeNull()
      expect(event?.type).toBe("feature")
      expect(event?.action).toBe("update")
    },
    TEST_TIMEOUT_MS,
  )

  it(
    "createComment publishes exactly one 'comment' event",
    async () => {
      const getEvent = await collectOne(projectChannel(projectId))
      await createComment(featureId, TEST_OWNER_ID, "hello")
      const event = (await Promise.race([
        getEvent(),
        new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
      ])) as { type: string } | null
      expect(event?.type).toBe("comment")
    },
    TEST_TIMEOUT_MS,
  )

  it(
    "acquireOrRefreshLock publishes a 'lock' event",
    async () => {
      const getEvent = await collectOne(projectChannel(projectId))
      await acquireOrRefreshLock(featureId, TEST_OWNER_ID)
      const event = (await Promise.race([
        getEvent(),
        new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
      ])) as { type: string; action: string } | null
      expect(event?.type).toBe("lock")
      expect(event?.action).toBe("acquire")
    },
    TEST_TIMEOUT_MS,
  )

  it(
    "a rejected conflicting lock attempt notifies the caller on their personal channel",
    async () => {
      await acquireOrRefreshLock(featureId, TEST_OWNER_ID)

      const getEvent = await collectOne(userChannel(TEST_COLLABORATOR_ID))
      await expect(acquireOrRefreshLock(featureId, TEST_COLLABORATOR_ID)).rejects.toThrow()
      const event = (await Promise.race([
        getEvent(),
        new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
      ])) as { type: string } | null
      expect(event?.type).toBe("notification")
    },
    TEST_TIMEOUT_MS,
  )

  it(
    "upsertPresence publishes a 'presence' event",
    async () => {
      const getEvent = await collectOne(projectChannel(projectId))
      await upsertPresence(projectId, TEST_OWNER_ID, { cursorLng: 1, cursorLat: 2 })
      const event = (await Promise.race([
        getEvent(),
        new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
      ])) as { type: string } | null
      expect(event?.type).toBe("presence")
    },
    TEST_TIMEOUT_MS,
  )

  it(
    "changeMemberRole publishes a 'member' event",
    async () => {
      const getEvent = await collectOne(projectChannel(projectId))
      await changeMemberRole(projectId, TEST_COLLABORATOR_ID, "Viewer")
      const event = (await Promise.race([
        getEvent(),
        new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
      ])) as { type: string } | null
      expect(event?.type).toBe("member")
    },
    TEST_TIMEOUT_MS,
  )
})
