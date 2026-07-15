import {
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

interface CandidateSnapshot {
  schemaVersion: number;
  test: {
    id: string;
    title: string;
    description: string | null;
    type: string;
    durationMinutes: number;
    totalQuestions: number;
  };
  sections: Array<{
    id: string;
    title: string;
    kind: 'LISTENING' | 'READING';
    part: string | null;
    order: number;
    questionGroups: Array<{
      id: string;
      type: string;
      title: string | null;
      order: number;
      stimuli: unknown[];
      questions: Array<{
        id: string;
        number: number;
        promptHtml: string;
        order: number;
        options: unknown[];
      }>;
    }>;
  }>;
}

interface AnswerKeySnapshot {
  schemaVersion: number;
  testId: string;
  questions: Array<{
    questionId: string;
    correctOptionId: string | null;
  }>;
}

interface ReviewSnapshot {
  schemaVersion: number;
  testId: string;
  groups: Array<{
    groupId: string;
    transcriptHtml: string | null;
    questions: Array<{
      questionId: string;
      promptHtml?: string;
      options?: unknown[];
      explanationHtml: string | null;
      grammarTopic: string | null;
      vocabularyTags: string[];
      difficulty: string | null;
      audioSegments: unknown[];
    }>;
  }>;
}

@Injectable()
export class AttemptReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async list(userId: string) {
    const attempts = await this.prisma.attempt.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        expiresAt: true,
        listeningCorrect: true,
        readingCorrect: true,
        listeningScore: true,
        readingScore: true,
        totalScore: true,
        resultJson: true,
        test: {
          select: { id: true, title: true, description: true, type: true },
        },
        testVersion: { select: { id: true, version: true } },
        _count: { select: { answers: true } },
      },
    });

    return attempts.map(({ resultJson, ...attempt }) => ({
      ...attempt,
      result: resultJson,
    }));
  }

  async review(id: string, userId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id, userId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        resultJson: true,
        test: { select: { id: true, title: true, type: true } },
        testVersion: {
          select: {
            id: true,
            version: true,
            candidatePayloadStorageKey: true,
            candidatePayloadHash: true,
            answerKeyStorageKey: true,
            answerKeyHash: true,
            reviewPayloadStorageKey: true,
            reviewPayloadHash: true,
          },
        },
        answers: {
          select: {
            questionId: true,
            selectedOptionId: true,
            isCorrect: true,
            isFlagged: true,
          },
        },
        timings: {
          select: {
            questionId: true,
            activeTimeMs: true,
            visitCount: true,
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt was not found');
    if (attempt.status === 'IN_PROGRESS') {
      throw new ConflictException('Submit the attempt before opening review');
    }

    const version = attempt.testVersion;
    const required = [
      version.candidatePayloadStorageKey,
      version.candidatePayloadHash,
      version.answerKeyStorageKey,
      version.answerKeyHash,
      version.reviewPayloadStorageKey,
      version.reviewPayloadHash,
    ];
    if (required.some((value) => !value)) {
      throw new ConflictException('Published review snapshots are incomplete');
    }

    const [candidate, answerKey, review] = await Promise.all([
      this.readPublic<CandidateSnapshot>(
        version.candidatePayloadStorageKey!,
        version.candidatePayloadHash!,
      ),
      this.readPrivate<AnswerKeySnapshot>(
        version.answerKeyStorageKey!,
        version.answerKeyHash!,
      ),
      this.readPrivate<ReviewSnapshot>(
        version.reviewPayloadStorageKey!,
        version.reviewPayloadHash!,
      ),
    ]);
    if (
      candidate.schemaVersion !== 1 ||
      answerKey.schemaVersion !== 1 ||
      review.schemaVersion !== 1 ||
      candidate.test.id !== attempt.test.id ||
      answerKey.testId !== attempt.test.id ||
      review.testId !== attempt.test.id
    ) {
      throw new ConflictException('Review snapshots do not match this attempt');
    }

    const answerByQuestion = new Map(
      attempt.answers.map((answer) => [answer.questionId, answer]),
    );
    const timingByQuestion = new Map(
      attempt.timings.map((timing) => [timing.questionId, timing]),
    );
    const correctByQuestion = new Map(
      answerKey.questions.map((question) => [
        question.questionId,
        question.correctOptionId,
      ]),
    );
    const privateGroupById = new Map(
      review.groups.map((group) => [group.groupId, group]),
    );

    return {
      attempt: {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        result: attempt.resultJson,
      },
      test: {
        ...attempt.test,
        version: version.version,
      },
      sections: candidate.sections.map((section) => ({
        id: section.id,
        title: section.title,
        kind: section.kind,
        part: section.part,
        order: section.order,
        groups: section.questionGroups.map((group) => {
          const privateGroup = privateGroupById.get(group.id);
          const privateQuestions = new Map(
            (privateGroup?.questions ?? []).map((question) => [
              question.questionId,
              question,
            ]),
          );
          return {
            id: group.id,
            type: group.type,
            title: group.title,
            order: group.order,
            stimuli: group.stimuli,
            transcriptHtml: privateGroup?.transcriptHtml ?? null,
            questions: group.questions.map((question) => {
              const userAnswer = answerByQuestion.get(question.id);
              const privateQuestion = privateQuestions.get(question.id);
              const correctOptionId =
                correctByQuestion.get(question.id) ?? null;
              return {
                ...question,
                promptHtml: privateQuestion?.promptHtml ?? question.promptHtml,
                options: privateQuestion?.options ?? question.options,
                correctOptionId,
                selectedOptionId: userAnswer?.selectedOptionId ?? null,
                isCorrect:
                  userAnswer?.isCorrect ??
                  Boolean(
                    correctOptionId &&
                    userAnswer?.selectedOptionId === correctOptionId,
                  ),
                isFlagged: userAnswer?.isFlagged ?? false,
                activeTimeMs:
                  timingByQuestion.get(question.id)?.activeTimeMs ?? 0,
                visitCount: timingByQuestion.get(question.id)?.visitCount ?? 0,
                explanationHtml: privateQuestion?.explanationHtml ?? null,
                grammarTopic: privateQuestion?.grammarTopic ?? null,
                vocabularyTags: privateQuestion?.vocabularyTags ?? [],
                difficulty: privateQuestion?.difficulty ?? null,
                audioSegments: privateQuestion?.audioSegments ?? [],
              };
            }),
          };
        }),
      })),
    };
  }

  private async readPublic<T>(storageKey: string, expectedHash: string) {
    const bytes = await this.storage.downloadBytes(storageKey);
    const text = Buffer.from(bytes).toString('utf8');
    this.verifyHash(text, expectedHash);
    return JSON.parse(text) as T;
  }

  private async readPrivate<T>(storageKey: string, expectedHash: string) {
    const bytes = await this.storage.downloadBytes(storageKey);
    const text = decryptSnapshot(
      bytes,
      this.config.get('JWT_SECRET', { infer: true }),
    );
    this.verifyHash(text, expectedHash);
    return JSON.parse(text) as T;
  }

  private verifyHash(value: string, expectedHash: string) {
    const actualHash = createHash('sha256').update(value).digest('hex');
    if (actualHash !== expectedHash) {
      throw new ConflictException('Review snapshot failed integrity check');
    }
  }
}
