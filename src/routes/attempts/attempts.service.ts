import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { EnvConfig } from '../../shared/config/env';
import { PrismaService } from '../../shared/database/prisma.service';
import { R2StorageService } from '../media/r2-storage.service';
import { decryptSnapshot } from '../tests/test-publishing.service';
import type {
  AttemptBatchInput,
  AttemptProgressInput,
} from './attempt.schemas';

interface AnswerKeyPayload {
  schemaVersion: number;
  testId: string;
  questions: Array<{ questionId: string; correctOptionId: string | null }>;
}

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async startOrResume(testId: string, userId: string) {
    const published = await this.prisma.test.findFirst({
      where: {
        id: testId,
        status: 'PUBLISHED',
        currentPublishedVersionId: { not: null },
      },
      select: {
        id: true,
        durationMinutes: true,
        fullListeningAudio: { select: { durationMs: true } },
        sections: {
          orderBy: { order: 'asc' },
          select: { kind: true, durationMinutes: true },
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
      return this.attemptResponse(existing.id, userId);
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
    const listeningDuration = hasListening
      ? (published.fullListeningAudio?.durationMs ?? timelineDurationMs)
      : 0;
    const explicitReadingMinutes = published.sections
      .filter((section) => section.kind === 'READING')
      .reduce((sum, section) => sum + (section.durationMinutes ?? 0), 0);
    const totalDurationMs = published.durationMinutes * 60_000;
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
    return this.attemptResponse(attempt.id, userId);
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
    const [savedAnswers, questionKinds] = await Promise.all([
      this.prisma.userAnswer.findMany({
        where: { attemptId: id, questionId: { in: questionIds } },
        select: { questionId: true, selectedOptionId: true },
      }),
      this.prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: {
          id: true,
          group: { select: { section: { select: { kind: true } } } },
        },
      }),
    ]);
    const selectedByQuestion = new Map(
      savedAnswers.map((item) => [item.questionId, item.selectedOptionId]),
    );
    const kindByQuestion = new Map(
      questionKinds.map((item) => [item.id, item.group.section.kind]),
    );
    let listeningCorrect = 0;
    let readingCorrect = 0;
    for (const key of answerKey.questions) {
      if (
        key.correctOptionId &&
        selectedByQuestion.get(key.questionId) === key.correctOptionId
      ) {
        if (kindByQuestion.get(key.questionId) === 'LISTENING') {
          listeningCorrect += 1;
        } else {
          readingCorrect += 1;
        }
      }
    }
    const profile = attempt.test.scoreConversionProfile;
    const listeningScore = profile
      ? mappedScore(profile.listeningMappingJson, listeningCorrect)
      : null;
    const readingScore = profile
      ? mappedScore(profile.readingMappingJson, readingCorrect)
      : null;
    const availableScores = [listeningScore, readingScore].filter(
      (value): value is number => value !== null,
    );

    await this.prisma.attempt.updateMany({
      where: { id, userId, status: 'IN_PROGRESS' },
      data: {
        status: automatic ? 'AUTO_SUBMITTED' : 'SUBMITTED',
        submittedAt: new Date(),
        listeningCorrect,
        readingCorrect,
        listeningScore,
        readingScore,
        totalScore:
          availableScores.length > 0
            ? availableScores.reduce((sum, value) => sum + value, 0)
            : null,
      },
    });
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
        answers: {
          select: {
            questionId: true,
            selectedOptionId: true,
            isFlagged: true,
            answeredAt: true,
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
    return { ...attempt, serverNow: new Date().toISOString() };
  }
}

function mappedScore(mapping: unknown, correct: number) {
  if (Array.isArray(mapping)) {
    const value: unknown = (mapping as unknown[])[correct];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  if (mapping && typeof mapping === 'object') {
    const value = (mapping as Record<string, unknown>)[String(correct)];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  return null;
}
