import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { PrismaService } from '../../shared/database/prisma.service';
import { MediaFileInspectorService } from './media-file-inspector.service';
import type {
  MediaListQuery,
  MediaUploadInput,
  UpdateMediaInput,
} from './media.schemas';
import { R2StorageService } from './r2-storage.service';

const usageCountSelect = {
  fullListeningTests: true,
  stimulusItems: true,
  directionAudioTemplates: true,
  exampleAudioTemplates: true,
  questionAudioSegments: true,
} as const;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
    private readonly inspector: MediaFileInspectorService,
  ) {}

  async list(query: MediaListQuery) {
    const where = {
      type: query.type,
      OR: query.search
        ? [
            {
              originalName: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
            {
              altText: { contains: query.search, mode: 'insensitive' as const },
            },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: usageCountSelect } },
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
      storageConfigured: this.storage.isConfigured(),
    };
  }

  async findOne(id: string) {
    const media = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: { _count: { select: usageCountSelect } },
    });
    if (!media) throw new NotFoundException('Media asset was not found');
    return media;
  }

  async upload(
    file: Express.Multer.File | undefined,
    input: MediaUploadInput,
    userId: string,
  ) {
    if (!file) throw new BadRequestException('A media file is required');
    try {
      const inspected = await this.inspector.inspect(file);
      const storageKey = createStorageKey(inspected.type, inspected.extension);
      const url = await this.storage.upload(
        file.path,
        storageKey,
        inspected.mimeType,
      );
      try {
        return await this.prisma.mediaAsset.create({
          data: {
            type: inspected.type,
            url,
            storageKey,
            originalName: file.originalname,
            mimeType: inspected.mimeType,
            sizeBytes: BigInt(file.size),
            width: inspected.width,
            height: inspected.height,
            durationMs: inspected.durationMs,
            altText: input.altText,
            createdById: userId,
          },
          include: { _count: { select: usageCountSelect } },
        });
      } catch (error) {
        await this.storage.delete(storageKey).catch(() => undefined);
        throw error;
      }
    } finally {
      await removeTemporaryFile(file.path);
    }
  }

  async replace(
    id: string,
    file: Express.Multer.File | undefined,
    input: MediaUploadInput,
  ) {
    if (!file) throw new BadRequestException('A replacement file is required');
    const existing = await this.findOne(id);
    try {
      const inspected = await this.inspector.inspect(file);
      if (inspected.type !== existing.type) {
        throw new BadRequestException(
          `Replacement must remain ${existing.type.toLowerCase()}`,
        );
      }
      const storageKey = createStorageKey(inspected.type, inspected.extension);
      const url = await this.storage.upload(
        file.path,
        storageKey,
        inspected.mimeType,
      );
      try {
        const updated = await this.prisma.mediaAsset.update({
          where: { id },
          data: {
            url,
            storageKey,
            originalName: file.originalname,
            mimeType: inspected.mimeType,
            sizeBytes: BigInt(file.size),
            width: inspected.width,
            height: inspected.height,
            durationMs: inspected.durationMs,
            altText: input.altText ?? existing.altText,
          },
          include: { _count: { select: usageCountSelect } },
        });
        await this.deleteObjectBestEffort(existing.storageKey);
        return updated;
      } catch (error) {
        await this.storage.delete(storageKey).catch(() => undefined);
        throw error;
      }
    } finally {
      await removeTemporaryFile(file.path);
    }
  }

  async update(id: string, input: UpdateMediaInput) {
    await this.findOne(id);
    return this.prisma.mediaAsset.update({
      where: { id },
      data: input,
      include: { _count: { select: usageCountSelect } },
    });
  }

  async usages(id: string) {
    const media = await this.prisma.mediaAsset.findUnique({
      where: { id },
      select: {
        id: true,
        originalName: true,
        fullListeningTests: { select: { id: true, title: true } },
        stimulusItems: {
          select: { id: true, group: { select: { id: true, title: true } } },
        },
        directionAudioTemplates: {
          select: { id: true, part: true, version: true },
        },
        exampleAudioTemplates: {
          select: { id: true, part: true, version: true },
        },
        questionAudioSegments: {
          select: { id: true, questionId: true, segmentType: true },
        },
      },
    });
    if (!media) throw new NotFoundException('Media asset was not found');
    return media;
  }

  async remove(id: string) {
    const media = await this.findOne(id);
    if (usageCount(media._count) > 0) {
      throw new ConflictException('Media is in use and cannot be deleted');
    }
    await this.prisma.mediaAsset.delete({ where: { id } });
    await this.deleteObjectBestEffort(media.storageKey);
  }

  private async deleteObjectBestEffort(storageKey: string) {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      this.logger.warn(
        `Could not delete R2 object ${storageKey}: ${String(error)}`,
      );
    }
  }
}

function usageCount(counts: Record<string, number>) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function createStorageKey(type: 'IMAGE' | 'AUDIO', extension: string) {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${type.toLowerCase()}/${now.getUTCFullYear()}/${month}/${randomUUID()}.${extension}`;
}

async function removeTemporaryFile(path: string) {
  await unlink(path).catch(() => undefined);
}
