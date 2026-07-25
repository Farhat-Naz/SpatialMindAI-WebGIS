import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/db/prismaClient", () => ({
  prismaClient: { $executeRaw: vi.fn().mockResolvedValue(undefined) },
}))

describe("cancelBackendPid", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("issues pg_cancel_backend for the given pid and resolves", async () => {
    const { cancelBackendPid } = await import("../pgCancel")
    const { prismaClient } = await import("@/server/db/prismaClient")

    await expect(cancelBackendPid(12345)).resolves.toBeUndefined()
    expect(prismaClient.$executeRaw).toHaveBeenCalledTimes(1)
  })
})
