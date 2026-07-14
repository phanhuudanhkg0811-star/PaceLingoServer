-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('FULL_TEST', 'MINI_TEST', 'PART_PRACTICE');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TestVersionStatus" AS ENUM ('BUILDING', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SectionKind" AS ENUM ('LISTENING', 'READING');

-- CreateEnum
CREATE TYPE "ToeicPart" AS ENUM ('PART_1', 'PART_2', 'PART_3', 'PART_4', 'PART_5', 'PART_6', 'PART_7');

-- CreateEnum
CREATE TYPE "DirectionMode" AS ENUM ('DEFAULT', 'CUSTOM', 'NONE');

-- CreateEnum
CREATE TYPE "QuestionGroupType" AS ENUM ('PHOTO', 'QUESTION_RESPONSE', 'CONVERSATION', 'TALK', 'INCOMPLETE_SENTENCE', 'TEXT_COMPLETION', 'SINGLE_PASSAGE', 'MULTIPLE_PASSAGE');

-- CreateEnum
CREATE TYPE "StimulusType" AS ENUM ('HTML', 'IMAGE', 'AUDIO');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'AUDIO');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('DIRECTION', 'EXAMPLE', 'QUESTION', 'QUESTION_GROUP', 'PART_TRANSITION', 'LISTENING_END');

-- CreateEnum
CREATE TYPE "AudioSegmentType" AS ENUM ('ANSWER_EVIDENCE', 'CONTEXT');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "PracticeSourceType" AS ENUM ('WRONG_ANSWERS', 'FLAGGED_QUESTIONS');

-- CreateEnum
CREATE TYPE "PracticeMode" AS ENUM ('RETRY');

-- CreateEnum
CREATE TYPE "PracticeStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ImportDraftStatus" AS ENUM ('PARSED', 'NEEDS_REVIEW', 'VALIDATED', 'PUBLISHED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ScoreConversionProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "listeningMappingJson" JSONB NOT NULL,
    "readingMappingJson" JSONB NOT NULL,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreConversionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Test" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "TestType" NOT NULL DEFAULT 'FULL_TEST',
    "status" "TestStatus" NOT NULL DEFAULT 'DRAFT',
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER NOT NULL,
    "fullListeningAudioId" TEXT,
    "scoreConversionProfileId" TEXT,
    "currentPublishedVersionId" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestVersion" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TestVersionStatus" NOT NULL DEFAULT 'BUILDING',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "candidatePayloadStorageKey" TEXT,
    "candidatePayloadHash" TEXT,
    "answerKeyStorageKey" TEXT,
    "answerKeyHash" TEXT,
    "reviewPayloadStorageKey" TEXT,
    "reviewPayloadHash" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestSection" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "SectionKind" NOT NULL,
    "part" "ToeicPart",
    "order" INTEGER NOT NULL,
    "durationMinutes" INTEGER,
    "directionMode" "DirectionMode" NOT NULL DEFAULT 'DEFAULT',
    "directionTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionGroup" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "externalId" TEXT,
    "type" "QuestionGroupType" NOT NULL,
    "title" TEXT,
    "transcriptHtml" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StimulusItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "type" "StimulusType" NOT NULL,
    "contentHtml" TEXT,
    "mediaAssetId" TEXT,
    "altText" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StimulusItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "externalId" TEXT,
    "number" INTEGER NOT NULL,
    "promptHtml" TEXT NOT NULL,
    "explanationHtml" TEXT,
    "grammarTopic" TEXT,
    "vocabularyTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "difficulty" "Difficulty",
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectionTemplate" (
    "id" TEXT NOT NULL,
    "part" "ToeicPart" NOT NULL,
    "directionText" TEXT NOT NULL,
    "directionAudioAssetId" TEXT,
    "exampleHtml" TEXT,
    "exampleAudioAssetId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "language" TEXT NOT NULL DEFAULT 'en',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "altText" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioTimelineEvent" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "sectionId" TEXT,
    "groupId" TEXT,
    "questionId" TEXT,
    "type" "TimelineEventType" NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAudioSegment" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "audioAssetId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "segmentType" "AudioSegmentType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionAudioSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "testVersionId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "listeningCorrect" INTEGER,
    "readingCorrect" INTEGER,
    "listeningScore" INTEGER,
    "readingScore" INTEGER,
    "totalScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionTiming" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "activeTimeMs" INTEGER NOT NULL DEFAULT 0,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionTiming_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceAttemptId" TEXT,
    "sourceType" "PracticeSourceType" NOT NULL,
    "mode" "PracticeMode" NOT NULL DEFAULT 'RETRY',
    "durationMinutes" INTEGER,
    "status" "PracticeStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSessionQuestion" (
    "id" TEXT NOT NULL,
    "practiceSessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "selectedOptionId" TEXT,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "PracticeSessionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportDraft" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "targetTestId" TEXT,
    "schemaVersion" INTEGER NOT NULL,
    "externalId" TEXT,
    "contentHash" TEXT NOT NULL,
    "status" "ImportDraftStatus" NOT NULL DEFAULT 'PARSED',
    "sourceJson" JSONB NOT NULL,
    "normalizedJson" JSONB,
    "validationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "errorJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoreConversionProfile_name_version_key" ON "ScoreConversionProfile"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Test_currentPublishedVersionId_key" ON "Test"("currentPublishedVersionId");

-- CreateIndex
CREATE INDEX "Test_status_type_idx" ON "Test"("status", "type");

-- CreateIndex
CREATE INDEX "Test_createdById_idx" ON "Test"("createdById");

-- CreateIndex
CREATE INDEX "Test_scoreConversionProfileId_idx" ON "Test"("scoreConversionProfileId");

-- CreateIndex
CREATE INDEX "TestVersion_testId_status_idx" ON "TestVersion"("testId", "status");

-- CreateIndex
CREATE INDEX "TestVersion_candidatePayloadHash_idx" ON "TestVersion"("candidatePayloadHash");

-- CreateIndex
CREATE INDEX "TestVersion_answerKeyHash_idx" ON "TestVersion"("answerKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "TestVersion_testId_version_key" ON "TestVersion"("testId", "version");

-- CreateIndex
CREATE INDEX "TestSection_directionTemplateId_idx" ON "TestSection"("directionTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "TestSection_testId_order_key" ON "TestSection"("testId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TestSection_testId_part_key" ON "TestSection"("testId", "part");

-- CreateIndex
CREATE INDEX "QuestionGroup_type_idx" ON "QuestionGroup"("type");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionGroup_sectionId_order_key" ON "QuestionGroup"("sectionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionGroup_sectionId_externalId_key" ON "QuestionGroup"("sectionId", "externalId");

-- CreateIndex
CREATE INDEX "StimulusItem_mediaAssetId_idx" ON "StimulusItem"("mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "StimulusItem_groupId_order_key" ON "StimulusItem"("groupId", "order");

-- CreateIndex
CREATE INDEX "Question_number_idx" ON "Question"("number");

-- CreateIndex
CREATE INDEX "Question_grammarTopic_idx" ON "Question"("grammarTopic");

-- CreateIndex
CREATE INDEX "Question_difficulty_idx" ON "Question"("difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "Question_groupId_order_key" ON "Question"("groupId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Question_groupId_externalId_key" ON "Question"("groupId", "externalId");

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_isCorrect_idx" ON "QuestionOption"("questionId", "isCorrect");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_label_key" ON "QuestionOption"("questionId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_order_key" ON "QuestionOption"("questionId", "order");

-- CreateIndex
CREATE INDEX "DirectionTemplate_part_language_isDefault_idx" ON "DirectionTemplate"("part", "language", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "DirectionTemplate_part_language_version_key" ON "DirectionTemplate"("part", "language", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_type_createdAt_idx" ON "MediaAsset"("type", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_createdById_idx" ON "MediaAsset"("createdById");

-- CreateIndex
CREATE INDEX "AudioTimelineEvent_testId_startMs_endMs_idx" ON "AudioTimelineEvent"("testId", "startMs", "endMs");

-- CreateIndex
CREATE INDEX "AudioTimelineEvent_sectionId_idx" ON "AudioTimelineEvent"("sectionId");

-- CreateIndex
CREATE INDEX "AudioTimelineEvent_groupId_idx" ON "AudioTimelineEvent"("groupId");

-- CreateIndex
CREATE INDEX "AudioTimelineEvent_questionId_idx" ON "AudioTimelineEvent"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AudioTimelineEvent_testId_order_key" ON "AudioTimelineEvent"("testId", "order");

-- CreateIndex
CREATE INDEX "QuestionAudioSegment_audioAssetId_idx" ON "QuestionAudioSegment"("audioAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAudioSegment_questionId_segmentType_startMs_endMs_key" ON "QuestionAudioSegment"("questionId", "segmentType", "startMs", "endMs");

-- CreateIndex
CREATE INDEX "Attempt_userId_status_idx" ON "Attempt"("userId", "status");

-- CreateIndex
CREATE INDEX "Attempt_userId_startedAt_idx" ON "Attempt"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "Attempt_testVersionId_idx" ON "Attempt"("testVersionId");

-- CreateIndex
CREATE INDEX "UserAnswer_questionId_idx" ON "UserAnswer"("questionId");

-- CreateIndex
CREATE INDEX "UserAnswer_selectedOptionId_idx" ON "UserAnswer"("selectedOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAnswer_attemptId_questionId_key" ON "UserAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "QuestionTiming_questionId_idx" ON "QuestionTiming"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionTiming_attemptId_questionId_key" ON "QuestionTiming"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "PracticeSession_userId_status_idx" ON "PracticeSession"("userId", "status");

-- CreateIndex
CREATE INDEX "PracticeSession_sourceAttemptId_idx" ON "PracticeSession"("sourceAttemptId");

-- CreateIndex
CREATE INDEX "PracticeSessionQuestion_questionId_idx" ON "PracticeSessionQuestion"("questionId");

-- CreateIndex
CREATE INDEX "PracticeSessionQuestion_selectedOptionId_idx" ON "PracticeSessionQuestion"("selectedOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSessionQuestion_practiceSessionId_questionId_key" ON "PracticeSessionQuestion"("practiceSessionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSessionQuestion_practiceSessionId_order_key" ON "PracticeSessionQuestion"("practiceSessionId", "order");

-- CreateIndex
CREATE INDEX "ImportDraft_createdById_status_idx" ON "ImportDraft"("createdById", "status");

-- CreateIndex
CREATE INDEX "ImportDraft_targetTestId_idx" ON "ImportDraft"("targetTestId");

-- CreateIndex
CREATE INDEX "ImportDraft_externalId_idx" ON "ImportDraft"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportDraft_createdById_contentHash_key" ON "ImportDraft"("createdById", "contentHash");

-- CreateIndex
CREATE INDEX "ImportJob_draftId_status_idx" ON "ImportJob"("draftId", "status");

-- CreateIndex
CREATE INDEX "ImportJob_createdById_idx" ON "ImportJob"("createdById");

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_fullListeningAudioId_fkey" FOREIGN KEY ("fullListeningAudioId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_scoreConversionProfileId_fkey" FOREIGN KEY ("scoreConversionProfileId") REFERENCES "ScoreConversionProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_currentPublishedVersionId_fkey" FOREIGN KEY ("currentPublishedVersionId") REFERENCES "TestVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestVersion" ADD CONSTRAINT "TestVersion_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSection" ADD CONSTRAINT "TestSection_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSection" ADD CONSTRAINT "TestSection_directionTemplateId_fkey" FOREIGN KEY ("directionTemplateId") REFERENCES "DirectionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionGroup" ADD CONSTRAINT "QuestionGroup_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TestSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StimulusItem" ADD CONSTRAINT "StimulusItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "QuestionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StimulusItem" ADD CONSTRAINT "StimulusItem_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "QuestionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectionTemplate" ADD CONSTRAINT "DirectionTemplate_directionAudioAssetId_fkey" FOREIGN KEY ("directionAudioAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectionTemplate" ADD CONSTRAINT "DirectionTemplate_exampleAudioAssetId_fkey" FOREIGN KEY ("exampleAudioAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioTimelineEvent" ADD CONSTRAINT "AudioTimelineEvent_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioTimelineEvent" ADD CONSTRAINT "AudioTimelineEvent_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TestSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioTimelineEvent" ADD CONSTRAINT "AudioTimelineEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "QuestionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioTimelineEvent" ADD CONSTRAINT "AudioTimelineEvent_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAudioSegment" ADD CONSTRAINT "QuestionAudioSegment_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAudioSegment" ADD CONSTRAINT "QuestionAudioSegment_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_testVersionId_fkey" FOREIGN KEY ("testVersionId") REFERENCES "TestVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAnswer" ADD CONSTRAINT "UserAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAnswer" ADD CONSTRAINT "UserAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAnswer" ADD CONSTRAINT "UserAnswer_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "QuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTiming" ADD CONSTRAINT "QuestionTiming_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTiming" ADD CONSTRAINT "QuestionTiming_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_sourceAttemptId_fkey" FOREIGN KEY ("sourceAttemptId") REFERENCES "Attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSessionQuestion" ADD CONSTRAINT "PracticeSessionQuestion_practiceSessionId_fkey" FOREIGN KEY ("practiceSessionId") REFERENCES "PracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSessionQuestion" ADD CONSTRAINT "PracticeSessionQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSessionQuestion" ADD CONSTRAINT "PracticeSessionQuestion_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "QuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportDraft" ADD CONSTRAINT "ImportDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportDraft" ADD CONSTRAINT "ImportDraft_targetTestId_fkey" FOREIGN KEY ("targetTestId") REFERENCES "Test"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ImportDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
