import { type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { handleRouteError } from "@/server/http/handleRouteError"
import { projectChannel, subscribe, userChannel } from "@/server/realtime/channel"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ projectId: string }>
}

const encoder = new TextEncoder()

function formatSseMessage(eventType: string, payload: unknown): Uint8Array {
  return encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`)
}

/**
 * `GET /api/projects/:projectId/stream` — Server-Sent Events (research.md
 * Decisions 1–2). Subscribes to both the project's channel (feature/layer/
 * comment/lock/presence/member events, broadcast to every member) and the
 * caller's own personal channel (notifications, research.md Decision 9),
 * merging both into one `text/event-stream` response. Unregisters both
 * subscriptions the moment the client disconnects.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params
    await assertProjectRole(projectId, user.id, "Viewer")

    let unsubscribeProject: (() => Promise<void>) | null = null
    let unsubscribeUser: (() => Promise<void>) | null = null

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const onEvent = (eventType: string) => (payload: unknown) => {
          try {
            controller.enqueue(formatSseMessage(eventType, payload))
          } catch {
            // The stream may already be closing — nothing to enqueue into.
          }
        }

        // A generic wrapper: `payload` from `publish()` already carries its
        // own `type` field (research.md Decisions 8–13 in the calling
        // repositories), so the SSE `event:` line uses that field directly.
        const dispatch = (payload: unknown) => {
          const type = (payload as { type?: string } | null)?.type ?? "message"
          onEvent(type)(payload)
        }

        unsubscribeProject = await subscribe(projectChannel(projectId), dispatch)
        unsubscribeUser = await subscribe(userChannel(user.id), dispatch)

        // An initial comment (SSE-legal) so the client's EventSource fires
        // `onopen` promptly rather than waiting for the first real event.
        controller.enqueue(encoder.encode(": connected\n\n"))
      },
      async cancel() {
        await unsubscribeProject?.()
        await unsubscribeUser?.()
      },
    })

    logger.info("SSE stream opened", { projectId, userId: user.id })

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
