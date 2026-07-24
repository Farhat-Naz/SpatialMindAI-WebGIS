import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * Seeds exactly one User row matching DEV_USER_ID (the interim
 * authentication seam, Research Decision 6). Idempotent via `upsert` on the
 * primary key — running this script any number of times never creates a
 * duplicate or errors.
 */
async function main() {
  const devUserId = process.env.DEV_USER_ID

  if (!devUserId) {
    throw new Error(
      "DEV_USER_ID must be set (see .env.example) to run the seed script.",
    )
  }

  await prisma.user.upsert({
    where: { id: devUserId },
    update: {},
    create: {
      id: devUserId,
      email: `${devUserId}@dev.local`,
    },
  })
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
