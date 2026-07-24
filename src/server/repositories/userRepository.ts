import type { User } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"

/** Looks up a user by id; returns null (not an exception) if none exists. */
export async function getUserById(id: string): Promise<User | null> {
  return prismaClient.user.findUnique({ where: { id } })
}
