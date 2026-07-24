import { Client } from "pg"
import { prismaClient } from "@/server/db/prismaClient"

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
    client.on("notification", (message) => {
      dispatchNotification(message.channel, message.payload)
    })
    // Reconnect-with-backoff on an unexpected drop is completed in Phase 8
    // (T106) once a realistic event flow exists to test it against — this
    // skeleton establishes the connection and publish/subscribe surface only.
    listenClient = client
    connecting = null
    return client
  })()
  return connecting
}

/**
 * Publishes `event` on `channel` via `pg_notify`, inside whichever
 * transaction/connection Prisma's own pool is currently using (research.md
 * Decision 2) — every Route Handler that changes shared state calls this
 * after (or as part of) its write.
 */
export async function publish(channel: string, event: unknown): Promise<void> {
  assertValidChannelName(channel)
  const payload = JSON.stringify(event)
  await prismaClient.$executeRaw`SELECT pg_notify(${channel}, ${payload})`
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
      await client.query(`UNLISTEN "${channel}"`)
    }
  }
}
