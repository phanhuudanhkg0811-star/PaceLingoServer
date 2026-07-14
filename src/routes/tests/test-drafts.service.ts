import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import type {
  CreateTestDraftInput,
  TestContentInput,
  UpdateTestDraftInput,
} from './test-draft.schemas';
import { validateTestDraft } from './test-draft.validator';

const treeInclude = {
  scoreConversionProfile: true,
  fullListeningAudio: true,
  currentPublishedVersion: true,
  sections: {
    orderBy: { order: 'asc' as const },
    include: {
      directionTemplate: true,
      questionGroups: {
        orderBy: { order: 'asc' as const },
        include: {
          stimuli: {
            orderBy: { order: 'asc' as const },
            include: { mediaAsset: true },
          },
          questions: {
            orderBy: { order: 'asc' as const },
            include: { options: { orderBy: { order: 'asc' as const } } },
          },
        },
      },
    },
  },
} satisfies Prisma.TestInclude;

@Injectable()
export class TestDraftsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.test.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        currentPublishedVersion: true,
        _count: { select: { sections: true, versions: true } },
      },
    });
  }

  async findTree(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      include: treeInclude,
    });
    if (!test) throw new NotFoundException('Test draft was not found');
    return test;
  }

  async create(input: CreateTestDraftInput, createdById: string) {
    const {
      content,
      scoreConversionProfileId,
      fullListeningAudioId,
      ...metadata
    } = input;
    const totalQuestions = content ? countQuestions(content) : 0;

    return this.prisma.test.create({
      data: {
        ...metadata,
        totalQuestions,
        createdBy: { connect: { id: createdById } },
        scoreConversionProfile: scoreConversionProfileId
          ? { connect: { id: scoreConversionProfileId } }
          : undefined,
        fullListeningAudio: fullListeningAudioId
          ? { connect: { id: fullListeningAudioId } }
          : undefined,
        sections: content
          ? { create: content.sections.map(toSectionCreate) }
          : undefined,
      },
      include: treeInclude,
    });
  }

  async updateMetadata(id: string, input: UpdateTestDraftInput) {
    await this.ensureEditable(id);
    const { scoreConversionProfileId, fullListeningAudioId, ...metadata } =
      input;

    return this.prisma.test.update({
      where: { id },
      data: {
        ...metadata,
        scoreConversionProfile:
          scoreConversionProfileId === undefined
            ? undefined
            : { connect: { id: scoreConversionProfileId } },
        fullListeningAudio:
          fullListeningAudioId === undefined
            ? undefined
            : fullListeningAudioId === null
              ? { disconnect: true }
              : { connect: { id: fullListeningAudioId } },
      },
      include: treeInclude,
    });
  }

  async replaceContent(id: string, content: TestContentInput) {
    await this.ensureEditable(id);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.testSection.deleteMany({ where: { testId: id } });
      await transaction.test.update({
        where: { id },
        data: {
          totalQuestions: countQuestions(content),
          sections: { create: content.sections.map(toSectionCreate) },
        },
      });
    });
    return this.findTree(id);
  }

  async validate(id: string) {
    const test = await this.findTree(id);
    return validateTestDraft(test);
  }

  async remove(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      select: { status: true, _count: { select: { versions: true } } },
    });
    if (!test) throw new NotFoundException('Test draft was not found');
    if (test.status !== 'DRAFT' || test._count.versions > 0) {
      throw new ConflictException(
        'Published or versioned tests cannot be deleted',
      );
    }
    await this.prisma.test.delete({ where: { id } });
  }

  private async ensureEditable(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!test) throw new NotFoundException('Test draft was not found');
    if (test.status !== 'DRAFT') {
      throw new ConflictException('Only draft tests can be edited');
    }
  }
}

function countQuestions(content: TestContentInput) {
  return content.sections.reduce(
    (sectionTotal, section) =>
      sectionTotal +
      section.questionGroups.reduce(
        (groupTotal, group) => groupTotal + group.questions.length,
        0,
      ),
    0,
  );
}

function toSectionCreate(
  section: TestContentInput['sections'][number],
): Prisma.TestSectionCreateWithoutTestInput {
  const { directionTemplateId, questionGroups, ...data } = section;
  return {
    ...data,
    directionTemplate: directionTemplateId
      ? { connect: { id: directionTemplateId } }
      : undefined,
    questionGroups: { create: questionGroups.map(toGroupCreate) },
  };
}

function toGroupCreate(
  group: TestContentInput['sections'][number]['questionGroups'][number],
): Prisma.QuestionGroupCreateWithoutSectionInput {
  const { stimuli, questions, ...data } = group;
  return {
    ...data,
    stimuli: { create: stimuli.map(toStimulusCreate) },
    questions: { create: questions.map(toQuestionCreate) },
  };
}

function toStimulusCreate(
  stimulus: TestContentInput['sections'][number]['questionGroups'][number]['stimuli'][number],
): Prisma.StimulusItemCreateWithoutGroupInput {
  const { mediaAssetId, ...data } = stimulus;
  return {
    ...data,
    mediaAsset: mediaAssetId ? { connect: { id: mediaAssetId } } : undefined,
  };
}

function toQuestionCreate(
  question: TestContentInput['sections'][number]['questionGroups'][number]['questions'][number],
): Prisma.QuestionCreateWithoutGroupInput {
  const { options, ...data } = question;
  return { ...data, options: { create: options } };
}
