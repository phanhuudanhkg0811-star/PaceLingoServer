import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import type {
  ContactFeedbackInput,
  QuestionErrorInput,
  FeedbackStatusInput,
} from './feedback.schemas';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async createContact(input: ContactFeedbackInput) {
    if (input.website) return { received: true };
    const report = await this.prisma.feedbackReport.create({
      data: {
        type: 'CONTACT',
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
      },
      select: { id: true, createdAt: true },
    });
    return {
      received: true,
      reference: report.id,
      createdAt: report.createdAt,
    };
  }

  async createQuestionError(userId: string, input: QuestionErrorInput) {
    const question = await this.prisma.question.findFirst({
      where: {
        id: input.questionId,
        group: {
          section: {
            test: { attempts: { some: { id: input.attemptId, userId } } },
          },
        },
      },
      select: { id: true },
    });
    if (!question) {
      throw new BadRequestException('Question does not belong to this attempt');
    }
    const report = await this.prisma.feedbackReport.create({
      data: {
        userId,
        type: 'QUESTION_ERROR',
        subject: `${input.category}: Question ${input.questionNumber}`,
        message: input.message,
        contextJson: {
          attemptId: input.attemptId,
          questionId: input.questionId,
          questionNumber: input.questionNumber,
          category: input.category,
        } satisfies Prisma.InputJsonObject,
      },
      select: { id: true, createdAt: true },
    });
    return {
      received: true,
      reference: report.id,
      createdAt: report.createdAt,
    };
  }

  list() {
    return this.prisma.feedbackReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  updateStatus(id: string, input: FeedbackStatusInput) {
    return this.prisma.feedbackReport.update({
      where: { id },
      data: { status: input.status },
    });
  }
}
