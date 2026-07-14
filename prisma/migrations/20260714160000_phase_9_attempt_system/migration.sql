ALTER TYPE "AttemptStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "Attempt"
ADD COLUMN "testId" TEXT,
ADD COLUMN "listeningEndsAt" TIMESTAMP(3),
ADD COLUMN "readingEndsAt" TIMESTAMP(3),
ADD COLUMN "currentSection" "SectionKind",
ADD COLUMN "currentQuestionId" TEXT;

UPDATE "Attempt" AS attempt
SET "testId" = version."testId"
FROM "TestVersion" AS version
WHERE attempt."testVersionId" = version."id";

ALTER TABLE "Attempt" ALTER COLUMN "testId" SET NOT NULL;

ALTER TABLE "UserAnswer"
ADD COLUMN "clientSequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "QuestionTiming"
ADD COLUMN "clientSequence" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Attempt_testId_status_idx" ON "Attempt"("testId", "status");

ALTER TABLE "Attempt"
ADD CONSTRAINT "Attempt_testId_fkey"
FOREIGN KEY ("testId") REFERENCES "Test"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
