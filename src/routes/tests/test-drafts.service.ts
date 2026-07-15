import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { R2StorageService } from '../media/r2-storage.service';
import type {
  CreateTestDraftInput,
  TestContentInput,
  UpdateTestDraftInput,
} from './test-draft.schemas';
import { validateTestDraft } from './test-draft.validator';
import type {
  AudioSegmentsInput,
  MoveQuestionInput,
  ReorderStimuliInput,
  StimulusInput,
  TimelineInput,
  UpdateGroupInput,
  UpdateQuestionInput,
} from './test-editor.schemas';

const treeInclude = {
  scoreConversionProfile: true,
  fullListeningAudio: true,
  currentPublishedVersion: true,
  sections: {
    orderBy: { order: 'asc' as const },
    include: {
      directionTemplate: {
        include: { directionAudioAsset: true, exampleAudioAsset: true },
      },
      questionGroups: {
        orderBy: { order: 'asc' as const },
        include: {
          stimuli: {
            orderBy: { order: 'asc' as const },
            include: { mediaAsset: true },
          },
          questions: {
            orderBy: { order: 'asc' as const },
            include: {
              options: { orderBy: { order: 'asc' as const } },
              audioSegments: {
                orderBy: { startMs: 'asc' as const },
                include: { audioAsset: true },
              },
            },
          },
        },
      },
    },
  },
  timelineEvents: { orderBy: { order: 'asc' as const } },
  versions: { orderBy: { version: 'desc' as const } },
} satisfies Prisma.TestInclude;

@Injectable()
export class TestDraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
  ) {}

  list() {
    return this.prisma.test.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        currentPublishedVersion: true,
        _count: { select: { sections: true, versions: true, attempts: true } },
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

  async appendContent(id: string, content: TestContentInput) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      select: {
        status: true,
        totalQuestions: true,
        sections: {
          select: {
            part: true,
            order: true,
            questionGroups: {
              select: { questions: { select: { number: true } } },
            },
          },
        },
      },
    });
    if (!test) throw new NotFoundException('Test draft was not found');
    if (test.status !== 'DRAFT') {
      throw new ConflictException('Only draft tests can be edited');
    }

    const existingParts = new Set(test.sections.map((section) => section.part));
    const incomingParts = content.sections.map((section) => section.part);
    const duplicatePart = incomingParts.find(
      (part) => part && existingParts.has(part),
    );
    if (duplicatePart) {
      throw new ConflictException(
        `${duplicatePart} already exists in this test`,
      );
    }
    const existingNumbers = new Set(
      test.sections.flatMap((section) =>
        section.questionGroups.flatMap((group) =>
          group.questions.map((question) => question.number),
        ),
      ),
    );
    const incomingNumbers = content.sections.flatMap((section) =>
      section.questionGroups.flatMap((group) =>
        group.questions.map((question) => question.number),
      ),
    );
    const duplicateNumber = incomingNumbers.find((number) =>
      existingNumbers.has(number),
    );
    if (duplicateNumber) {
      throw new ConflictException(
        `Question ${duplicateNumber} already exists in this test`,
      );
    }

    const nextOrder =
      Math.max(-1, ...test.sections.map((section) => section.order)) + 1;
    await this.prisma.test.update({
      where: { id },
      data: {
        totalQuestions: test.totalQuestions + countQuestions(content),
        sections: {
          create: content.sections.map((section, index) =>
            toSectionCreate({ ...section, order: nextOrder + index }),
          ),
        },
      },
    });
    return this.findTree(id);
  }

  async validate(id: string) {
    const test = await this.findTree(id);
    const validation = validateTestDraft(test);
    validateTimeline(test, validation.errors, validation.warnings);
    validateMediaUrls(test, validation.errors);
    await this.validateDefaultDirections(test, validation.errors);
    validation.valid = validation.errors.length === 0;
    return validation;
  }

  async updateGroup(id: string, input: UpdateGroupInput) {
    await this.ensureGroupEditable(id);
    return this.prisma.questionGroup.update({
      where: { id },
      data: input,
      include: {
        stimuli: { orderBy: { order: 'asc' } },
        questions: {
          orderBy: { order: 'asc' },
          include: { options: { orderBy: { order: 'asc' } } },
        },
      },
    });
  }

  async createQuestion(groupId: string, input: UpdateQuestionInput) {
    const group = await this.ensureGroupEditable(groupId);
    const last = await this.prisma.question.aggregate({
      where: { groupId },
      _max: { order: true },
    });
    const question = await this.prisma.question.create({
      data: {
        ...questionData(input),
        order: (last._max.order ?? -1) + 1,
        group: { connect: { id: groupId } },
        options: { create: input.options },
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    await this.prisma.test.update({
      where: { id: group.section.testId },
      data: { totalQuestions: { increment: 1 } },
    });
    return question;
  }

  async updateQuestion(id: string, input: UpdateQuestionInput) {
    await this.ensureQuestionEditable(id);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.questionOption.deleteMany({
        where: { questionId: id },
      });
      return transaction.question.update({
        where: { id },
        data: {
          ...questionData(input),
          options: { create: input.options },
        },
        include: {
          options: { orderBy: { order: 'asc' } },
          audioSegments: {
            orderBy: { startMs: 'asc' },
            include: { audioAsset: true },
          },
        },
      });
    });
  }

  async duplicateQuestion(id: string) {
    const source = await this.ensureQuestionEditable(id);
    const [lastOrder, maxNumber] = await Promise.all([
      this.prisma.question.aggregate({
        where: { groupId: source.groupId },
        _max: { order: true },
      }),
      this.prisma.question.aggregate({
        where: { group: { section: { testId: source.group.section.testId } } },
        _max: { number: true },
      }),
    ]);
    const duplicated = await this.prisma.question.create({
      data: {
        groupId: source.groupId,
        number: (maxNumber._max.number ?? 0) + 1,
        promptHtml: source.promptHtml,
        explanationHtml: source.explanationHtml,
        grammarTopic: source.grammarTopic,
        vocabularyTags: source.vocabularyTags,
        difficulty: source.difficulty,
        order: (lastOrder._max.order ?? -1) + 1,
        options: {
          create: source.options.map(
            ({ label, contentHtml, isCorrect, order }) => ({
              label,
              contentHtml,
              isCorrect,
              order,
            }),
          ),
        },
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    await this.prisma.test.update({
      where: { id: source.group.section.testId },
      data: { totalQuestions: { increment: 1 } },
    });
    return duplicated;
  }

  async removeQuestion(id: string) {
    const question = await this.ensureQuestionEditable(id);
    await this.prisma.$transaction([
      this.prisma.question.delete({ where: { id } }),
      this.prisma.test.update({
        where: { id: question.group.section.testId },
        data: { totalQuestions: { decrement: 1 } },
      }),
    ]);
  }

  async moveQuestion(id: string, input: MoveQuestionInput) {
    const question = await this.ensureQuestionEditable(id);
    const target = await this.ensureGroupEditable(input.targetGroupId);
    if (question.group.section.testId !== target.section.testId) {
      throw new ConflictException('Questions cannot move between tests');
    }
    const last = await this.prisma.question.aggregate({
      where: { groupId: input.targetGroupId },
      _max: { order: true },
    });
    return this.prisma.question.update({
      where: { id },
      data: {
        groupId: input.targetGroupId,
        order: (last._max.order ?? -1) + 1,
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });
  }

  async createStimulus(groupId: string, input: StimulusInput) {
    await this.ensureGroupEditable(groupId);
    await this.validateStimulusMedia(input);
    const last = await this.prisma.stimulusItem.aggregate({
      where: { groupId },
      _max: { order: true },
    });
    return this.prisma.stimulusItem.create({
      data: {
        ...input,
        order: input.order ?? (last._max.order ?? -1) + 1,
        groupId,
      },
      include: { mediaAsset: true },
    });
  }

  async updateStimulus(id: string, input: StimulusInput) {
    const existing = await this.prisma.stimulusItem.findUnique({
      where: { id },
      include: { group: { include: { section: true } } },
    });
    if (!existing) throw new NotFoundException('Stimulus not found');
    await this.ensureEditable(existing.group.section.testId);
    await this.validateStimulusMedia(input);
    return this.prisma.stimulusItem.update({
      where: { id },
      data: input,
      include: { mediaAsset: true },
    });
  }

  async removeStimulus(id: string) {
    const existing = await this.prisma.stimulusItem.findUnique({
      where: { id },
      include: { group: { include: { section: true } } },
    });
    if (!existing) throw new NotFoundException('Stimulus not found');
    await this.ensureEditable(existing.group.section.testId);
    await this.prisma.stimulusItem.delete({ where: { id } });
  }

  async reorderStimuli(groupId: string, input: ReorderStimuliInput) {
    await this.ensureGroupEditable(groupId);
    const count = await this.prisma.stimulusItem.count({
      where: { groupId, id: { in: input.stimulusIds } },
    });
    if (count !== input.stimulusIds.length) {
      throw new ConflictException('Stimulus order contains invalid IDs');
    }
    await this.prisma.$transaction(
      input.stimulusIds.map((id, order) =>
        this.prisma.stimulusItem.update({ where: { id }, data: { order } }),
      ),
    );
  }

  async saveTimeline(id: string, input: TimelineInput) {
    await this.ensureEditable(id);
    const test = await this.findTree(id);
    const sectionIds = new Set(test.sections.map((section) => section.id));
    const groupIds = new Set(
      test.sections.flatMap((section) =>
        section.questionGroups.map((group) => group.id),
      ),
    );
    const questionIds = new Set(
      test.sections.flatMap((section) =>
        section.questionGroups.flatMap((group) =>
          group.questions.map((question) => question.id),
        ),
      ),
    );
    for (const event of input.events) {
      if (
        (event.sectionId && !sectionIds.has(event.sectionId)) ||
        (event.groupId && !groupIds.has(event.groupId)) ||
        (event.questionId && !questionIds.has(event.questionId))
      ) {
        throw new ConflictException(
          'Timeline target does not belong to this test',
        );
      }
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.audioTimelineEvent.deleteMany({
        where: { testId: id },
      });
      if (input.events.length) {
        await transaction.audioTimelineEvent.createMany({
          data: input.events.map((event) => ({ ...event, testId: id })),
        });
      }
    });
    return this.findTree(id);
  }

  async saveAudioSegments(questionId: string, input: AudioSegmentsInput) {
    await this.ensureQuestionEditable(questionId);
    const audioIds = [
      ...new Set(input.segments.map((segment) => segment.audioAssetId)),
    ];
    const audioAssets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: audioIds }, type: 'AUDIO' },
      select: { id: true, durationMs: true },
    });
    if (audioAssets.length !== audioIds.length) {
      throw new ConflictException('Audio segment references invalid media');
    }
    const durationById = new Map(
      audioAssets.map((asset) => [asset.id, asset.durationMs]),
    );
    const outsideAudio = input.segments.find((segment) => {
      const duration = durationById.get(segment.audioAssetId);
      return (
        duration !== null && duration !== undefined && segment.endMs > duration
      );
    });
    if (outsideAudio) {
      throw new ConflictException('Audio segment exceeds media duration');
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.questionAudioSegment.deleteMany({
        where: { questionId },
      });
      if (input.segments.length) {
        await transaction.questionAudioSegment.createMany({
          data: input.segments.map((segment) => ({ ...segment, questionId })),
        });
      }
    });
    return this.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        options: { orderBy: { order: 'asc' } },
        audioSegments: {
          orderBy: { startMs: 'asc' },
          include: { audioAsset: true },
        },
      },
    });
  }

  async remove(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      select: {
        status: true,
        _count: { select: { attempts: true } },
        versions: {
          select: {
            candidatePayloadStorageKey: true,
            answerKeyStorageKey: true,
            reviewPayloadStorageKey: true,
          },
        },
      },
    });
    if (!test) throw new NotFoundException('Test draft was not found');
    if (test._count.attempts > 0) {
      throw new ConflictException(
        'Tests with attempts cannot be deleted. Archive the test instead to preserve user history.',
      );
    }
    await this.prisma.test.delete({ where: { id } });

    const snapshotKeys = test.versions.flatMap((version) =>
      [
        version.candidatePayloadStorageKey,
        version.answerKeyStorageKey,
        version.reviewPayloadStorageKey,
      ].filter((key): key is string => Boolean(key)),
    );
    await Promise.all(
      snapshotKeys.map((key) =>
        this.storage.delete(key).catch(() => undefined),
      ),
    );
  }

  async archive(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!test) throw new NotFoundException('Test was not found');
    if (test.status === 'ARCHIVED') return;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.test.update({
        where: { id },
        data: {
          status: 'ARCHIVED',
          currentPublishedVersionId: null,
          publishedAt: null,
        },
      });
      await transaction.testVersion.updateMany({
        where: { testId: id, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      });
    });
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

  private async ensureGroupEditable(id: string) {
    const group = await this.prisma.questionGroup.findUnique({
      where: { id },
      include: { section: { include: { test: true } } },
    });
    if (!group) throw new NotFoundException('Question group not found');
    if (group.section.test.status !== 'DRAFT') {
      throw new ConflictException('Only draft tests can be edited');
    }
    return group;
  }

  private async ensureQuestionEditable(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: {
        options: { orderBy: { order: 'asc' } },
        group: { include: { section: { include: { test: true } } } },
      },
    });
    if (!question) throw new NotFoundException('Question not found');
    if (question.group.section.test.status !== 'DRAFT') {
      throw new ConflictException('Only draft tests can be edited');
    }
    return question;
  }

  private async validateStimulusMedia(input: StimulusInput) {
    if (!input.mediaAssetId) return;
    const expectedType =
      input.type === 'IMAGE'
        ? 'IMAGE'
        : input.type === 'AUDIO'
          ? 'AUDIO'
          : null;
    if (!expectedType) {
      throw new ConflictException('HTML stimuli cannot reference media');
    }
    const media = await this.prisma.mediaAsset.findFirst({
      where: { id: input.mediaAssetId, type: expectedType },
    });
    if (!media)
      throw new ConflictException(`Stimulus requires ${expectedType} media`);
  }

  private async validateDefaultDirections(
    test: Awaited<ReturnType<TestDraftsService['findTree']>>,
    errors: Array<{ code: string; path: string; message: string }>,
  ) {
    const defaultParts = test.sections
      .filter((section) => section.directionMode === 'DEFAULT' && section.part)
      .map((section) => section.part!);
    if (!defaultParts.length) return;
    const defaults = await this.prisma.directionTemplate.findMany({
      where: { part: { in: defaultParts }, language: 'en', isDefault: true },
      select: { part: true },
    });
    const available = new Set(defaults.map((item) => item.part));
    defaultParts.forEach((part) => {
      if (!available.has(part)) {
        errors.push({
          code: 'MISSING_DEFAULT_DIRECTION',
          path: `parts.${part}.direction`,
          message: `No default English Direction exists for ${part}.`,
        });
      }
    });
  }
}

function questionData(input: UpdateQuestionInput) {
  return {
    number: input.number,
    promptHtml: input.promptHtml,
    explanationHtml: input.explanationHtml,
    grammarTopic: input.grammarTopic,
    vocabularyTags: input.vocabularyTags,
    difficulty: input.difficulty,
  };
}

export function validateTimeline(
  test: Awaited<ReturnType<TestDraftsService['findTree']>>,
  errors: Array<{ code: string; path: string; message: string }>,
  warnings: Array<{ code: string; path: string; message: string }>,
) {
  const events = [...test.timelineEvents].sort(
    (left, right) => left.startMs - right.startMs,
  );
  events.forEach((event, index) => {
    const previous = events[index - 1];
    if (!previous) return;
    if (event.startMs < previous.endMs) {
      errors.push({
        code: 'TIMELINE_OVERLAP',
        path: `timelineEvents.${index}`,
        message: `Event ${event.order} overlaps event ${previous.order}.`,
      });
      return;
    }
    const gap = event.startMs - previous.endMs;
    if (gap > 5000) {
      errors.push({
        code: 'TIMELINE_GAP',
        path: `timelineEvents.${index}`,
        message: `Timeline has an uncovered gap of ${gap} ms.`,
      });
    } else if (gap > 1000) {
      warnings.push({
        code: 'TIMELINE_SMALL_GAP',
        path: `timelineEvents.${index}`,
        message: `Timeline has a ${gap} ms gap.`,
      });
    }
  });

  if (
    test.type === 'FULL_TEST' &&
    test.fullListeningAudio &&
    events.length > 0
  ) {
    const listeningEnds = events.filter(
      (event) => event.type === 'LISTENING_END',
    );
    if (listeningEnds.length !== 1) {
      errors.push({
        code: 'INVALID_LISTENING_END',
        path: 'timelineEvents',
        message:
          'Full-audio tests require exactly one LISTENING_END timeline event.',
      });
    }
    const duration = test.fullListeningAudio?.durationMs;
    if (duration) {
      events.forEach((event, index) => {
        if (event.endMs > duration) {
          errors.push({
            code: 'TIMELINE_EXCEEDS_AUDIO',
            path: `timelineEvents.${index}.endMs`,
            message: `Event ends after the full Listening audio (${duration} ms).`,
          });
        }
      });
    }
  }
}

function validateMediaUrls(
  test: Awaited<ReturnType<TestDraftsService['findTree']>>,
  errors: Array<{ code: string; path: string; message: string }>,
) {
  const media = [
    test.fullListeningAudio,
    ...test.sections.flatMap((section) =>
      section.questionGroups.flatMap((group) => [
        ...group.stimuli.map((stimulus) => stimulus.mediaAsset),
        ...group.questions.flatMap((question) =>
          question.audioSegments.map((segment) => segment.audioAsset),
        ),
      ]),
    ),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  media.forEach((asset) => {
    try {
      const url = new URL(asset.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      errors.push({
        code: 'INVALID_MEDIA_URL',
        path: `media.${asset.id}.url`,
        message: `Media ${asset.originalName} does not have a valid public URL.`,
      });
    }
  });
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
