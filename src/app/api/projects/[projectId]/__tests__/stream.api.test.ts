import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_OWNER_ID,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { publish, projectChannel, resetChannelForTests } from "@/server/realtime/channel"
import { GET } from "../stream/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string): Request {
  return new Request(url, { method: "GET" })
}

/** Reads and decodes SSE messages off a ReadableStream's reader until at least `count` are collected or a timeout elapses. */
async function readSseMessages(stream: ReadableStream<Uint8Array>, count: number, timeoutMs = 5000): Promise<string[]> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  const messages: string[] = []
  const deadline = Date.now() + timeoutMs

  while (messages.length < count && Date.now() < deadline) {
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise<{ value: undefined; done: true }>((resolve) =>
        setTimeout(() => resolve({ value: undefined, done: true }), 200),
      ),
    ])
    if (done && !value) continue
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split("\n\n")
    buffer = parts.pop() ?? ""
    for (const part of parts) {
      if (part.trim() && !part.startsWith(":")) {
        messages.push(part)
      }
    }
  }
  await reader.cancel().catch(() => {})
  return messages
}

describe.skipIf(!dbAvailable)("SSE stream Route Handler", () => {
  let projectId: string

  beforeEach(async () => {
    resetChannelForTests()
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Stream API Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
  })

  it("a publish() call for this project's channel results in exactly one SSE message written to the stream", async () => {
    const response = await GET(jsonRequest(`http://localhost/api/projects/${projectId}/stream`) as never, {
      params: Promise.resolve({ projectId }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("text/event-stream")

    // Give the stream's `start()` callback time to actually subscribe
    // before publishing, since `subscribe()` is itself async.
    await new Promise((resolve) => setTimeout(resolve, 300))

    await publish(projectChannel(projectId), { type: "feature", action: "create", featureId: "f1" })

    const messages = await readSseMessages(response.body!, 1)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain("event: feature")
    expect(messages[0]).toContain('"featureId":"f1"')
  })

  it("a non-member request is rejected with 404 before any stream would open", async () => {
    process.env.DEV_USER_ID = "test-stream-stranger-2"
    await prismaClient.user.upsert({
      where: { id: "test-stream-stranger-2" },
      update: {},
      create: { id: "test-stream-stranger-2", email: "test-stream-stranger-2@dev.local" },
    })

    const response = await GET(jsonRequest(`http://localhost/api/projects/${projectId}/stream`) as never, {
      params: Promise.resolve({ projectId }),
    })
    expect(response.status).toBe(404)
    expect(response.headers.get("Content-Type")).not.toBe("text/event-stream")
  })
})
