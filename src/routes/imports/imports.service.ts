import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { createTestDraftSchema } from '../tests/test-draft.schemas';
import { TestDraftsService } from '../tests/test-drafts.service';
import { contentHash, normalizeImport } from './import-normalizer';
import type {
  ImportListQuery,
  ParseImportInput,
  PublishImportInput,
  UpdateImportInput,
} from './import.schemas';

const importInclude = {
  targetTest: { select: { id: true, title: true, status: true } },
  jobs: { orderBy: { createdAt: 'desc' as const }, take: 5 },
} as const;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tests: TestDraftsService,
  ) {}

  async list(query: ImportListQuery, userId: string) {
    const where = { createdById: userId, status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.importDraft.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: importInclude,
      }),
      this.prisma.importDraft.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async findOne(id: string, userId: string) {
    const draft = await this.prisma.importDraft.findFirst({
      where: { id, createdById: userId },
      include: importInclude,
    });
    if (!draft) throw new NotFoundException('Import draft not found');
    return draft;
  }

  async parse(input: ParseImportInput, userId: string) {
    const hash = contentHash(input.source);
    const existing = await this.prisma.importDraft.findUnique({
      where: {
        createdById_contentHash: { createdById: userId, contentHash: hash },
      },
      include: importInclude,
    });
    if (existing) return { ...existing, duplicate: true };

    const result = normalizeImport(input.source, input.skipInvalidQuestions);
    return this.prisma.importDraft.create({
      data: {
        createdById: userId,
        targetTestId: input.targetTestId,
        schemaVersion: result.schemaVersion,
        externalId: result.externalId,
        contentHash: hash,
        status: result.validation.valid ? 'VALIDATED' : 'NEEDS_REVIEW',
        sourceJson: toJson(input.source),
        normalizedJson: toJson(result.normalized),
        validationJson: toJson(result.validation),
      },
      include: importInclude,
    });
  }

  async update(id: string, input: UpdateImportInput, userId: string) {
    const draft = await this.findOne(id, userId);
    if (draft.status === 'PUBLISHED' || draft.status === 'DISCARDED') {
      throw new ConflictException(
        'Published or discarded imports cannot be edited',
      );
    }
    const result = normalizeImport(input.source, input.skipInvalidQuestions);
    const hash = contentHash(input.source);
    try {
      return await this.prisma.importDraft.update({
        where: { id },
        data: {
          schemaVersion: result.schemaVersion,
          externalId: result.externalId,
          contentHash: hash,
          status: result.validation.valid ? 'VALIDATED' : 'NEEDS_REVIEW',
          sourceJson: toJson(input.source),
          normalizedJson: toJson(result.normalized),
          validationJson: toJson(result.validation),
        },
        include: importInclude,
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ConflictException('This JSON has already been imported');
      }
      throw error;
    }
  }

  async publish(id: string, input: PublishImportInput, userId: string) {
    const draft = await this.findOne(id, userId);
    if (draft.status === 'PUBLISHED' && draft.targetTestId) {
      return {
        importDraft: draft,
        test: await this.tests.findTree(draft.targetTestId),
        duplicate: true,
      };
    }
    if (draft.status !== 'VALIDATED') {
      throw new BadRequestException(
        'Resolve import errors before creating a test draft',
      );
    }
    const normalized = createTestDraftSchema.safeParse(draft.normalizedJson);
    if (!normalized.success) {
      throw new BadRequestException(
        normalized.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`,
        ),
      );
    }

    const totalItems = normalized.data.content
      ? normalized.data.content.sections.reduce(
          (total, section) =>
            total +
            section.questionGroups.reduce(
              (groupTotal, group) => groupTotal + group.questions.length,
              0,
            ),
          0,
        )
      : 0;
    const job = await this.prisma.importJob.create({
      data: {
        draftId: id,
        createdById: userId,
        status: 'PROCESSING',
        totalItems,
        startedAt: new Date(),
      },
    });

    try {
      const targetTestId =
        input.targetTestId ?? draft.targetTestId ?? undefined;
      const test = await this.applyImport(
        normalized.data,
        input.mode,
        targetTestId,
        userId,
      );
      const [importDraft] = await this.prisma.$transaction([
        this.prisma.importDraft.update({
          where: { id },
          data: { status: 'PUBLISHED', targetTestId: test.id },
          include: importInclude,
        }),
        this.prisma.importJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            processedItems: totalItems,
            completedAt: new Date(),
          },
        }),
      ]);
      return { importDraft, test, duplicate: false };
    } catch (error) {
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorJson: toJson({
            message: error instanceof Error ? error.message : String(error),
          }),
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async discard(id: string, userId: string) {
    const draft = await this.findOne(id, userId);
    if (draft.status === 'PUBLISHED') {
      throw new ConflictException('Published imports cannot be discarded');
    }
    return this.prisma.importDraft.update({
      where: { id },
      data: { status: 'DISCARDED' },
      include: importInclude,
    });
  }

  private async applyImport(
    normalized: ReturnType<typeof createTestDraftSchema.parse>,
    mode: PublishImportInput['mode'],
    targetTestId: string | undefined,
    userId: string,
  ) {
    if (mode === 'CREATE_TEST') {
      return this.tests.create(normalized, userId);
    }
    if (!targetTestId) {
      throw new BadRequestException(`${mode} requires a target test`);
    }
    if (!normalized.content) {
      throw new BadRequestException('Import contains no sections');
    }
    if (mode === 'REPLACE_CONTENT') {
      await this.tests.updateMetadata(targetTestId, {
        title: normalized.title,
        description: normalized.description,
        type: normalized.type,
        durationMinutes: normalized.durationMinutes,
      });
      return this.tests.replaceContent(targetTestId, normalized.content);
    }
    return this.tests.appendContent(targetTestId, normalized.content);
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isUniqueConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
