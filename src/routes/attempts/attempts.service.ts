import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client';
import type { EnvConfig } from '../../shared/config/env';
import { PrismaService } from '../../shared/database/prisma.service';
import { R2StorageService } from '../media/r2-storage.service';
import { decryptSnapshot } from '../tests/test-publishing.service';
import type {
  AttemptBatchInput,
  AttemptProgressInput,
} from './attempt.schemas';
import {
  buildAttemptResult,
  type ScoreConversionSnapshot,
  type ToeicPart,
} from './attempt-result';

interface AnswerKeyPayload {
  schemaVersion: number;
  testId: string;
  scoreConversion?: ScoreConversionSnapshot | null;
  questions: Array<{
    questionId: string;
    correctOptionId: string | null;
    number?: number;
    kind?: 'LISTENING' | 'READING';
    part?: ToeicPart | null;
  }>;
}

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async startOrResume(testId: string, userId: string, restart = false) {
    const published = await this.prisma.test.findFirst({
      where: {
        id: testId,
        status: 'PUBLISHED',
        currentPublishedVersionId: { not: null },
      },
      select: {
        id: true,
        type: true,
        durationMinutes: true,
        fullListeningAudio: { select: { durationMs: true } },
        sections: {
          orderBy: { order: 'asc' },
          select: {
            kind: true,
            durationMinutes: true,
            questionGroups: {
              select: {
                stimuli: {
                  where: { type: 'AUDIO' },
                  orderBy: { order: 'asc' },
                  select: {
                    mediaAsset: { select: { durationMs: true } },
                  },
                },
              },
            },
          },
        },
        timelineEvents: { select: { endMs: true } },
        currentPublishedVersion: {
          select: { id: true, status: true },
        },
      },
    });
    if (
      !published?.currentPublishedVersion ||
      published.currentPublishedVersion.status !== 'PUBLISHED'
    ) {
      throw new NotFoundException('Published test version was not found');
    }

    const existing = await this.prisma.attempt.findFirst({
      where: {
        userId,
        testId,
        testVersionId: published.currentPublishedVersion.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true, expiresAt: true },
    });
    if (existing) {
      if (existing.expiresAt <= new Date()) {
        return this.finish(existing.id, userId, true);
      }
      if (!restart) {
        return {
          ...(await this.attemptResponse(existing.id, userId)),
          resumed: true,
        };
      }
      await this.prisma.attempt.update({
        where: { id: existing.id },
        data: { status: 'ABANDONED' },
      });
    }

    const now = new Date();
    const timelineDurationMs = published.timelineEvents.reduce(
      (maximum, event) => Math.max(maximum, event.endMs),
      0,
    );
    const hasListening = published.sections.some(
      (section) => section.kind === 'LISTENING',
    );
    const hasReading = published.sections.some(
      (section) => section.kind === 'READING',
    );
    const segmentedListeningDurationMs = published.sections
      .filter((section) => section.kind === 'LISTENING')
      .flatMap((section) => section.questionGroups)
      .reduce(
        (sum, group) => sum + (group.stimuli[0]?.mediaAsset?.durationMs ?? 0),
        0,
      );
    const explicitListeningMinutes = published.sections
      .filter((section) => section.kind === 'LISTENING')
      .reduce((sum, section) => sum + (section.durationMinutes ?? 0), 0);
    const totalDurationMs = published.durationMinutes * 60_000;
    const listeningDuration = hasListening
      ? explicitListeningMinutes > 0
        ? explicitListeningMinutes * 60_000
        : published.type === 'FULL_TEST' && hasReading
          ? Math.min(45 * 60_000, totalDurationMs)
          : segmentedListeningDurationMs ||
            published.fullListeningAudio?.durationMs ||
            timelineDurationMs
      : 0;
    const explicitReadingMinutes = published.sections
      .filter((section) => section.kind === 'READING')
      .reduce((sum, section) => sum + (section.durationMinutes ?? 0), 0);
    const readingDuration = hasReading
      ? explicitReadingMinutes > 0
        ? explicitReadingMinutes * 60_000
        : listeningDuration > 0
          ? Math.max(60_000, totalDurationMs - listeningDuration)
          : totalDurationMs
      : 0;
    const listeningEndsAt =
      listeningDuration > 0
        ? new Date(now.getTime() + listeningDuration)
        : null;
    const readingStartsAt = listeningEndsAt ?? now;
    const readingEndsAt =
      readingDuration > 0
        ? new Date(readingStartsAt.getTime() + readingDuration)
        : null;
    const expiresAt =
      readingEndsAt ??
      listeningEndsAt ??
      new Date(now.getTime() + totalDurationMs);

    const attempt = await this.prisma.attempt.create({
      data: {
        userId,
        testId,
        testVersionId: published.currentPublishedVersion.id,
        startedAt: now,
        listeningEndsAt,
        readingEndsAt,
        expiresAt,
        currentSection: listeningDuration > 0 ? 'LISTENING' : 'READING',
      },
      select: { id: true },
    });
    return {
      ...(await this.attemptResponse(attempt.id, userId)),
      resumed: false,
    };
  }

  async findOne(id: string, userId: string) {
    const attempt = await this.ownedAttempt(id, userId);
    if (attempt.status === 'IN_PROGRESS' && attempt.expiresAt <= new Date()) {
      return this.finish(id, userId, true);
    }
    return this.attemptResponse(id, userId);
  }

  async saveBatch(id: string, userId: string, input: AttemptBatchInput) {
    const attempt = await this.requireWritable(id, userId);
    await this.validateBatch(attempt.testId, input);

    await this.prisma.$transaction(async (transaction) => {
      for (const answer of input.answers) {
        const existing = await transaction.userAnswer.findUnique({
          where: {
            attemptId_questionId: {
              attemptId: id,
              questionId: answer.questionId,
            },
          },
          select: { clientSequence: true },
        });
        if (existing && existing.clientSequence >= answer.clientSequence) {
          continue;
        }
        await transaction.userAnswer.upsert({
          where: {
            attemptId_questionId: {
              attemptId: id,
              questionId: answer.questionId,
            },
          },
          create: {
            attemptId: id,
            questionId: answer.questionId,
            selectedOptionId: answer.optionId,
            isFlagged: answer.isFlagged,
            answeredAt: answer.answeredAt ? new Date(answer.answeredAt) : null,
            clientSequence: answer.clientSequence,
          },
          update: {
            selectedOptionId: answer.optionId,
            isFlagged: answer.isFlagged,
            answeredAt: answer.answeredAt ? new Date(answer.answeredAt) : null,
            clientSequence: answer.clientSequence,
          },
        });
      }

      for (const timing of input.timings) {
        const existing = await transaction.questionTiming.findUnique({
          where: {
            attemptId_questionId: {
              attemptId: id,
              questionId: timing.questionId,
            },
          },
          select: { clientSequence: true },
        });
        if (existing && existing.clientSequence >= timing.clientSequence) {
          continue;
        }
        await transaction.questionTiming.upsert({
          where: {
            attemptId_questionId: {
              attemptId: id,
              questionId: timing.questionId,
            },
          },
          create: {
            attemptId: id,
            questionId: timing.questionId,
            activeTimeMs: timing.activeTimeMs,
            visitCount: timing.visitCount,
            firstViewedAt: timing.firstViewedAt
              ? new Date(timing.firstViewedAt)
              : null,
            lastViewedAt: timing.lastViewedAt
              ? new Date(timing.lastViewedAt)
              : null,
            clientSequence: timing.clientSequence,
          },
          update: {
            activeTimeMs: timing.activeTimeMs,
            visitCount: timing.visitCount,
            firstViewedAt: timing.firstViewedAt
              ? new Date(timing.firstViewedAt)
              : null,
            lastViewedAt: timing.lastViewedAt
              ? new Date(timing.lastViewedAt)
              : null,
            clientSequence: timing.clientSequence,
          },
        });
      }
    });

    return { saved: true, serverNow: new Date().toISOString() };
  }

  async saveProgress(id: string, userId: string, input: AttemptProgressInput) {
    const attempt = await this.requireWritable(id, userId);
    if (input.currentQuestionId) {
      const question = await this.prisma.question.findFirst({
        where: {
          id: input.currentQuestionId,
          group: {
            section: { testId: attempt.testId, kind: input.currentSection },
          },
        },
        select: { id: true },
      });
      if (!question) {
        throw new BadRequestException(
          'Progress references an invalid question',
        );
      }
    }
    await this.prisma.attempt.update({
      where: { id },
      data: input,
    });
    return { saved: true, serverNow: new Date().toISOString() };
  }

  async submit(id: string, userId: string, input: AttemptBatchInput) {
    const attempt = await this.ownedAttempt(id, userId);
    if (attempt.status !== 'IN_PROGRESS') {
      return this.attemptResponse(id, userId);
    }
    const expired = attempt.expiresAt <= new Date();
    if (!expired && (input.answers.length || input.timings.length)) {
      await this.saveBatch(id, userId, input);
    }
    return this.finish(id, userId, expired);
  }

  private async finish(id: string, userId: string, automatic: boolean) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id, userId },
      include: {
        testVersion: {
          select: {
            answerKeyStorageKey: true,
            answerKeyHash: true,
          },
        },
        test: {
          select: {
            scoreConversionProfile: {
              select: {
                name: true,
                source: true,
                version: true,
                isOfficial: true,
                listeningMappingJson: true,
                readingMappingJson: true,
              },
            },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt was not found');
    if (attempt.status !== 'IN_PROGRESS') {
      return this.attemptResponse(id, userId);
    }
    const { answerKeyStorageKey, answerKeyHash } = attempt.testVersion;
    if (!answerKeyStorageKey || !answerKeyHash) {
      throw new ConflictException('Published answer key is missing');
    }

    const encrypted = await this.storage.downloadBytes(answerKeyStorageKey);
    const plainText = decryptSnapshot(
      encrypted,
      this.config.get('JWT_SECRET', { infer: true }),
    );
    const actualHash = createHash('sha256').update(plainText).digest('hex');
    if (actualHash !== answerKeyHash) {
      throw new ConflictException(
        'Published answer key failed integrity check',
      );
    }
    const answerKey = JSON.parse(plainText) as AnswerKeyPayload;
    if (answerKey.schemaVersion !== 1 || answerKey.testId !== attempt.testId) {
      throw new ConflictException(
        'Published answer key does not match attempt',
      );
    }

    const questionIds = answerKey.questions.map((item) => item.questionId);
    const [savedAnswers, questionMetadata, savedTimings] = await Promise.all([
      this.prisma.userAnswer.findMany({
        where: { attemptId: id, questionId: { in: questionIds } },
        select: { questionId: true, selectedOptionId: true },
      }),
      this.prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: {
          id: true,
          number: true,
          group: {
            select: { section: { select: { kind: true, part: true } } },
          },
        },
      }),
      this.prisma.questionTiming.findMany({
        where: { attemptId: id, questionId: { in: questionIds } },
        select: { questionId: true, activeTimeMs: true, visitCount: true },
      }),
    ]);
    const metadataByQuestion = new Map(
      questionMetadata.map((item) => [item.id, item]),
    );
    const questions = answerKey.questions.map((key) => {
      const metadata = metadataByQuestion.get(key.questionId);
      const kind = key.kind ?? metadata?.group.section.kind;
      if (!kind) {
        throw new ConflictException('Question grading metadata is missing');
      }
      return {
        questionId: key.questionId,
        correctOptionId: key.correctOptionId,
        number: key.number ?? metadata?.number ?? 0,
        kind,
        part: key.part ?? metadata?.group.section.part ?? null,
      };
    });
    const conversion =
      answerKey.scoreConversion === undefined
        ? attempt.test.scoreConversionProfile
        : answerKey.scoreConversion;
    const finishedAt = new Date();
    const result = buildAttemptResult({
      questions,
      answers: savedAnswers,
      timings: savedTimings,
      durationMs:
        Math.min(finishedAt.getTime(), attempt.expiresAt.getTime()) -
        attempt.startedAt.getTime(),
      conversion,
    });
    const correctPairs = questions
      .filter((question) => question.correctOptionId !== null)
      .map((question) => ({
        questionId: question.questionId,
        selectedOptionId: question.correctOptionId!,
      }));

    await this.prisma.$transaction([
      this.prisma.userAnswer.updateMany({
        where: { attemptId: id, selectedOptionId: { not: null } },
        data: { isCorrect: false },
      }),
      this.prisma.userAnswer.updateMany({
        where: { attemptId: id, OR: correctPairs },
        data: { isCorrect: true },
      }),
      this.prisma.attempt.updateMany({
        where: { id, userId, status: 'IN_PROGRESS' },
        data: {
          status: automatic ? 'AUTO_SUBMITTED' : 'SUBMITTED',
          submittedAt: finishedAt,
          listeningCorrect: result.score.listening.correct,
          readingCorrect: result.score.reading.correct,
          listeningScore: result.score.listening.scaled,
          readingScore: result.score.reading.scaled,
          totalScore: result.score.totalScaled,
          resultJson: result as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    return this.attemptResponse(id, userId);
  }

  private async validateBatch(testId: string, input: AttemptBatchInput) {
    const questionIds = [
      ...new Set([
        ...input.answers.map((item) => item.questionId),
        ...input.timings.map((item) => item.questionId),
      ]),
    ];
    if (!questionIds.length) return;
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds }, group: { section: { testId } } },
      select: { id: true, options: { select: { id: true } } },
    });
    const byId = new Map(questions.map((item) => [item.id, item]));
    if (byId.size !== questionIds.length) {
      throw new BadRequestException(
        'Batch references a question outside this test',
      );
    }
    for (const answer of input.answers) {
      if (
        answer.optionId &&
        !byId
          .get(answer.questionId)
          ?.options.some((option) => option.id === answer.optionId)
      ) {
        throw new BadRequestException(
          'Answer option does not belong to question',
        );
      }
    }
  }

  private async requireWritable(id: string, userId: string) {
    const attempt = await this.ownedAttempt(id, userId);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new ConflictException('Attempt is no longer editable');
    }
    if (attempt.expiresAt <= new Date()) {
      await this.finish(id, userId, true);
      throw new ConflictException('Attempt time has expired and was submitted');
    }
    return attempt;
  }

  private async ownedAttempt(id: string, userId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id, userId },
      select: {
        id: true,
        testId: true,
        status: true,
        expiresAt: true,
      },
    });
    if (!attempt) throw new NotFoundException('Attempt was not found');
    return attempt;
  }

  private async attemptResponse(id: string, userId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id, userId },
      select: {
        id: true,
        testId: true,
        testVersionId: true,
        status: true,
        startedAt: true,
        listeningEndsAt: true,
        readingEndsAt: true,
        expiresAt: true,
        submittedAt: true,
        currentSection: true,
        currentQuestionId: true,
        listeningCorrect: true,
        readingCorrect: true,
        listeningScore: true,
        readingScore: true,
        totalScore: true,
        resultJson: true,
        answers: {
          select: {
            questionId: true,
            selectedOptionId: true,
            isFlagged: true,
            answeredAt: true,
            isCorrect: true,
            clientSequence: true,
          },
        },
        timings: {
          select: {
            questionId: true,
            activeTimeMs: true,
            visitCount: true,
            firstViewedAt: true,
            lastViewedAt: true,
            clientSequence: true,
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt was not found');
    const { resultJson, ...response } = attempt;
    return {
      ...response,
      result: resultJson,
      serverNow: new Date().toISOString(),
    };
  }
}
