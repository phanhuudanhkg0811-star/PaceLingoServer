ALTER TABLE "Attempt"
ADD COLUMN "resultJson" JSONB;

ALTER TABLE "UserAnswer"
ADD COLUMN "isCorrect" BOOLEAN;
