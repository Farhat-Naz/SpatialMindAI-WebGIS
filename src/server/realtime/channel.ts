import { Client } from "pg"
import type { Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { logger } from "@/shared/lib/logger"

export type RealtimeEventCallback = (payload: unknown) => void

/**
 * Channel names are built internally from known-safe identifiers (e.g.
 * `collab:project:{projectId}`), never taken verbatim from user input —
 * `LISTEN`/`UNLISTEN` cannot be parameterized the way `NOTIFY`'s payload
 * can be, so this is a defense-in-depth guard against SQL injection via a
 * malformed channel name (Constitution Principle VI), not the primary
 * safety mechanism.
 */
const VALID_CHANNEL_NAME = /^[a-zA-Z0-9:_-]+$/

function assertValidChannelName(channel: string): void {
  if (!VALID_CHANNEL_NAME.test(channel)) {
    throw new Error(`Invalid realtime channel name: "${channel}"`)
  }
}

/** The channel every member of a project's SSE stream listens on (feature/layer/comment/lock/presence/member events). */
export function projectChannel(projectId: string): string {
  return `collab:project:${projectId}`
}

/** A user's personal channel (research.md Decision 9) — notifications are published here, never to a project channel. */
export function userChannel(userId: string): string {
  return `collab:user:${userId}`
}

/**
 * The one dedicated `pg` `LISTEN` connection this process holds
 * (research.md Decision 2) — Prisma Client has no `LISTEN`/`NOTIFY` API.
 * Lazily connected on first `subscribe()` call, never at module import
 * time, so importing this module has no side effect for code that never
 * calls `subscribe`.
 */
let listenClient: Client | null = null
let connecting: Promise<Client> | null = null
const subscribers = new Map<string, Set<RealtimeEventCallback>>()

const MAX_RECONNECT_ATTEMPTS = 8
const BASE_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 30_000

function dispatchNotification(channel: string, rawPayload: string | undefined): void {
  const callbacks = subscribers.get(channel)
  if (!callbacks || callbacks.size === 0) {
    return
  }
  let payload: unknown = rawPayload
  if (rawPayload) {
    try {
      payload = JSON.parse(rawPayload)
    } catch {
      // Leave as the raw string — a malformed payload should not crash dispatch.
    }
  }
  for (const callback of callbacks) {
    callback(payload)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Re-issues `LISTEN` for every channel that still has active subscribers —
 * a fresh connection has no memory of a previous connection's `LISTEN`
 * statements, so this must run immediately after every (re)connect.
 */
async function reattachListeners(client: Client): Promise<void> {
  for (const channel of subscribers.keys()) {
    await client.query(`LISTEN "${channel}"`)
  }
}

/**
 * Reconnects the dedicated `LISTEN` connection with exponential backoff
 * (plan.md Risks — a dropped `LISTEN` connection is independent of, and
 * must not be confused with, any client's own `EventSource` reconnect).
 * Gives up after `MAX_RECONNECT_ATTEMPTS`, logging each failure; a future
 * `subscribe()`/`publish()` call will naturally retry via `getListenClient`.
 */
async function reconnectWithBackoff(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    const backoffMs = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS)
    await sleep(backoffMs)
    try {
      const client = new Client({ connectionString: process.env.DATABASE_URL })
      await client.connect()
      attachClientHandlers(client)
      await reattachListeners(client)
      listenClient = client
      logger.info("realtime channel: LISTEN connection re-established", { attempt })
      return
    } catch (error) {
      logger.warn("realtime channel: reconnect attempt failed", {
        attempt,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  logger.error("realtime channel: exhausted reconnect attempts, giving up", {
    attempts: MAX_RECONNECT_ATTEMPTS,
  })
}

function attachClientHandlers(client: Client): void {
  client.on("notification", (message) => {
    dispatchNotification(message.channel, message.payload)
  })
  client.on("error", (error) => {
    logger.warn("realtime channel: LISTEN connection error", { message: error.message })
    if (listenClient === client) {
      listenClient = null
      void reconnectWithBackoff()
    }
  })
  client.on("end", () => {
    if (listenClient === client) {
      listenClient = null
      void reconnectWithBackoff()
    }
  })
}

async function getListenClient(): Promise<Client> {
  if (listenClient) {
    return listenClient
  }
  if (connecting) {
    return connecting
  }
  connecting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    attachClientHandlers(client)
    listenClient = client
    connecting = null
    return client
  })()
  return connecting
}

/**
 * Publishes `event` on `channel` via `pg_notify`. Accepts an optional open
 * `Prisma.TransactionClient` (default: the module-level `prismaClient`) —
 * callers writing inside a `$transaction` MUST pass their `tx` here:
 * Postgres defers a `NOTIFY` issued inside a transaction until that
 * transaction commits (and drops it entirely on rollback), which is
 * exactly the "inside the same transaction as the write" guarantee
 * research.md Decision 2 requires. Calling this with the wrong client
 * (the module-level pool instead of `tx`) would fire the notification on a
 * separate connection immediately — before the write is even visible to
 * other connections — the same class of bug documented on
 * `featureRepository.assembleFeature`.
 */
export async function publish(
  channel: string,
  event: unknown,
  client: Prisma.TransactionClient | typeof prismaClient = prismaClient,
): Promise<void> {
  assertValidChannelName(channel)
  const payload = JSON.stringify(event)
  await client.$executeRaw`SELECT pg_notify(${channel}, ${payload})`
}

/**
 * Registers `onEvent` to receive every `publish()` call on `channel` from
 * any server instance (research.md Decision 2's cross-instance fan-out).
 * Returns an unsubscribe function — the SSE Route Handler (Phase 4) calls
 * it when the client disconnects. Issues `LISTEN`/`UNLISTEN` only on the
 * first subscriber / last unsubscriber for a given channel, not per call.
 */
export async function subscribe(
  channel: string,
  onEvent: RealtimeEventCallback,
): Promise<() => Promise<void>> {
  assertValidChannelName(channel)
  const client = await getListenClient()

  let callbacks = subscribers.get(channel)
  if (!callbacks) {
    callbacks = new Set()
    subscribers.set(channel, callbacks)
    await client.query(`LISTEN "${channel}"`)
  }
  callbacks.add(onEvent)

  return async () => {
    callbacks!.delete(onEvent)
    if (callbacks!.size === 0) {
      subscribers.delete(channel)
      if (listenClient) {
        await listenClient.query(`UNLISTEN "${channel}"`).catch(() => {
          // The connection may already be down mid-reconnect — nothing to
          // unlisten from in that case, and reattachListeners won't re-add
          // a channel with zero subscribers on the next reconnect anyway.
        })
      }
    }
  }
}

/** Test-only helper: resets the module's connection state between test files. */
export function resetChannelForTests(): void {
  listenClient?.removeAllListeners()
  listenClient = null
  connecting = null
  subscribers.clear()
}
