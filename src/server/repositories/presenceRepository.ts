import type { Presence } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { projectChannel, publish } from "@/server/realtime/channel"

/** A presence row older than this is treated as offline at read time (spec Assumptions). */
const PRESENCE_TIMEOUT_MS = 30 * 1000

export interface UpsertPresenceInput {
  cursorLng?: number
  cursorLat?: number
  viewportBounds?: [number, number, number, number]
  currentFeatureId?: string
}

/**
 * Upserts one member's presence heartbeat (US9). `lastSeenAt` is refreshed
 * on every call. No dedicated cleanup job exists (research.md Decision 3)
 * — `listActivePresenceForProject` opportunistically deletes stale rows
 * for the project it's reading, keeping the table bounded without a
 * scheduled worker this codebase has no infrastructure for. Publishes a
 * `presence` realtime event on every heartbeat/cursor/extent change (US9
 * scenario 2–3).
 */
export async function upsertPresence(
  projectId: string,
  userId: string,
  input: UpsertPresenceInput,
): Promise<Presence> {
  return prismaClient.$transaction(async (tx) => {
    const presence = await tx.presence.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: {
        cursorLng: input.cursorLng,
        cursorLat: input.cursorLat,
        viewportBounds: input.viewportBounds,
        currentFeatureId: input.currentFeatureId,
        lastSeenAt: new Date(),
      },
      create: {
        projectId,
        userId,
        cursorLng: input.cursorLng,
        cursorLat: input.cursorLat,
        viewportBounds: input.viewportBounds,
        currentFeatureId: input.currentFeatureId,
      },
    })
    await publish(
      projectChannel(projectId),
      {
        type: "presence",
        userId,
        cursorLng: presence.cursorLng,
        cursorLat: presence.cursorLat,
        viewportBounds: presence.viewportBounds,
        currentFeatureId: presence.currentFeatureId,
        lastSeenAt: presence.lastSeenAt.toISOString(),
      },
      tx,
    )
    return presence
  })
}

/**
 * Lists active members' presence for a project — rows older than the 30s
 * timeout are excluded and opportunistically deleted (research.md
 * Decision 3), never appearing in the result.
 */
export async function listActivePresenceForProject(projectId: string): Promise<Presence[]> {
  const staleThreshold = new Date(Date.now() - PRESENCE_TIMEOUT_MS)

  await prismaClient.presence.deleteMany({
    where: { projectId, lastSeenAt: { lt: staleThreshold } },
  })

  return prismaClient.presence.findMany({
    where: { projectId, lastSeenAt: { gte: staleThreshold } },
    orderBy: { lastSeenAt: "desc" },
  })
}

/** Removes a member's presence row (e.g., on explicit disconnect/logout). */
export async function removePresence(projectId: string, userId: string): Promise<void> {
  await prismaClient.presence.deleteMany({ where: { projectId, userId } })
}
