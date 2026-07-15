import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/prisma/client.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  const tests = await prisma.test.findMany({
    where: { status: "PUBLISHED" },
    select: {
      title: true,
      type: true,
      totalQuestions: true,
      fullListeningAudioId: true,
      sections: { select: { part: true } },
      timelineEvents: {
        where: { type: "LISTENING_END" },
        select: { id: true },
      },
      currentPublishedVersion: {
        select: {
          candidatePayloadStorageKey: true,
          answerKeyStorageKey: true,
          reviewPayloadStorageKey: true,
        },
      },
    },
  });
  const audits = tests.map((test) => {
    const parts = new Set(test.sections.map((section) => section.part).filter(Boolean));
    const version = test.currentPublishedVersion;
    const checks = {
      fullTest: test.type === "FULL_TEST",
      questions200: test.totalQuestions === 200,
      sevenParts: parts.size === 7,
      fullAudio: Boolean(test.fullListeningAudioId),
      listeningEnd: test.timelineEvents.length > 0,
      snapshots: Boolean(
        version?.candidatePayloadStorageKey &&
          version.answerKeyStorageKey &&
          version.reviewPayloadStorageKey,
      ),
    };
    return {
      title: test.title,
      ready: Object.values(checks).every(Boolean),
      checks,
    };
  });
  const objectStorage = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_URL",
  ].every((key) => Boolean(process.env[key]));
  const ready = objectStorage && audits.some((audit) => audit.ready);
  console.log(JSON.stringify({ ready, objectStorage, publishedTests: audits }, null, 2));
  if (!ready) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
