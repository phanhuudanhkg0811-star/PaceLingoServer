import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import type { PracticeSubmitInput, RetryAttemptInput } from './attempt.schemas';

@Injectable()
export class PracticeSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromWrongAnswers(
    attemptId: string,
    userId: string,
    input: RetryAttemptInput,
  ) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, userId },
      select: {
        id: true,
        status: true,
        answers: {
          where: { selectedOptionId: { not: null } },
          select: {
            questionId: true,
            selectedOptionId: true,
            question: {
              select: {
                options: {
                  where: { isCorrect: true },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt was not found');
    if (attempt.status === 'IN_PROGRESS') {
      throw new ConflictException('Submit the attempt before creating retry');
    }

    const wrongQuestionIds = shuffle(
      attempt.answers
        .filter(
          (answer) =>
            answer.question.options[0]?.id &&
            answer.selectedOptionId !== answer.question.options[0].id,
        )
        .map((answer) => answer.questionId),
    ).slice(0, input.maxQuestions ?? 100);
    if (!wrongQuestionIds.length) {
      throw new BadRequestException(
        'This attempt has no wrong answers to retry',
      );
    }

    const session = await this.prisma.practiceSession.create({
      data: {
        userId,
        sourceAttemptId: attempt.id,
        sourceType: 'WRONG_ANSWERS',
        mode: 'RETRY',
        questions: {
          create: wrongQuestionIds.map((questionId, order) => ({
            questionId,
            order,
          })),
        },
      },
      select: { id: true },
    });
    return { id: session.id, questionCount: wrongQuestionIds.length };
  }

  async findOne(id: string, userId: string) {
    const session = await this.prisma.practiceSession.findFirst({
      where: { id, userId },
      select: {
        id: true,
        sourceAttemptId: true,
        sourceType: true,
        mode: true,
        status: true,
        durationMinutes: true,
        createdAt: true,
        completedAt: true,
        sourceAttempt: {
          select: { test: { select: { id: true, title: true } } },
        },
        questions: {
          orderBy: { order: 'asc' },
          select: {
            order: true,
            selectedOptionId: true,
            answeredAt: true,
            question: {
              select: {
                id: true,
                number: true,
                promptHtml: true,
                explanationHtml: true,
                grammarTopic: true,
                vocabularyTags: true,
                difficulty: true,
                options: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    label: true,
                    contentHtml: true,
                    isCorrect: true,
                  },
                },
                group: {
                  select: {
                    id: true,
                    title: true,
                    stimuli: {
                      orderBy: { order: 'asc' },
                      select: {
                        id: true,
                        type: true,
                        contentHtml: true,
                        altText: true,
                        mediaAsset: {
                          select: {
                            id: true,
                            type: true,
                            url: true,
                            mimeType: true,
                            altText: true,
                          },
                        },
                      },
                    },
                    section: {
                      select: { kind: true, part: true, title: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Practice session was not found');

    const completed = session.status === 'COMPLETED';
    return {
      id: session.id,
      sourceAttemptId: session.sourceAttemptId,
      sourceType: session.sourceType,
      mode: session.mode,
      status: session.status,
      durationMinutes: session.durationMinutes,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      test: session.sourceAttempt?.test ?? null,
      questions: session.questions.map((item) => {
        const correctOption = item.question.options.find(
          (option) => option.isCorrect,
        );
        return {
          order: item.order,
          id: item.question.id,
          number: item.question.number,
          promptHtml: item.question.promptHtml,
          selectedOptionId: item.selectedOptionId,
          answeredAt: item.answeredAt,
          group: {
            id: item.question.group.id,
            title: item.question.group.title,
            section: item.question.group.section,
            stimuli: item.question.group.stimuli.map(
              ({ mediaAsset, ...stimulus }) => ({
                ...stimulus,
                media: mediaAsset,
              }),
            ),
          },
          options: item.question.options.map(({ isCorrect, ...option }) => ({
            ...option,
            ...(completed ? { isCorrect } : {}),
          })),
          ...(completed
            ? {
                correctOptionId: correctOption?.id ?? null,
                isCorrect:
                  Boolean(correctOption?.id) &&
                  item.selectedOptionId === correctOption?.id,
                explanationHtml: item.question.explanationHtml,
                grammarTopic: item.question.grammarTopic,
                vocabularyTags: item.question.vocabularyTags,
                difficulty: item.question.difficulty,
              }
            : {}),
        };
      }),
    };
  }

  async submit(id: string, userId: string, input: PracticeSubmitInput) {
    const session = await this.prisma.practiceSession.findFirst({
      where: { id, userId },
      select: {
        status: true,
        questions: {
          select: {
            questionId: true,
            question: { select: { options: { select: { id: true } } } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Practice session was not found');
    if (session.status !== 'IN_PROGRESS') return this.findOne(id, userId);

    const byQuestion = new Map(
      session.questions.map((item) => [item.questionId, item]),
    );
    for (const answer of input.answers) {
      const question = byQuestion.get(answer.questionId);
      if (!question) {
        throw new BadRequestException(
          'Answer is outside this practice session',
        );
      }
      if (
        answer.optionId &&
        !question.question.options.some(
          (option) => option.id === answer.optionId,
        )
      ) {
        throw new BadRequestException(
          'Answer option does not belong to question',
        );
      }
    }

    const answerByQuestion = new Map(
      input.answers.map((answer) => [answer.questionId, answer.optionId]),
    );
    const completedAt = new Date();
    await this.prisma.$transaction([
      ...session.questions.map((question) =>
        this.prisma.practiceSessionQuestion.update({
          where: {
            practiceSessionId_questionId: {
              practiceSessionId: id,
              questionId: question.questionId,
            },
          },
          data: {
            selectedOptionId: answerByQuestion.get(question.questionId) ?? null,
            answeredAt: answerByQuestion.get(question.questionId)
              ? completedAt
              : null,
          },
        }),
      ),
      this.prisma.practiceSession.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt },
      }),
    ]);
    return this.findOne(id, userId);
  }
}

function shuffle<T>(values: T[]) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}
