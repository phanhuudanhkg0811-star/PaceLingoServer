import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import type {
  CreateDirectionTemplateInput,
  DirectionTemplateListQuery,
  ResolveDirectionQuery,
  UpdateDirectionTemplateInput,
} from './direction-template.schemas';

const templateInclude = {
  directionAudioAsset: true,
  exampleAudioAsset: true,
  _count: { select: { sections: true } },
} as const;

@Injectable()
export class DirectionTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: DirectionTemplateListQuery) {
    return this.prisma.directionTemplate.findMany({
      where: { part: query.part, language: query.language },
      orderBy: [{ part: 'asc' }, { version: 'desc' }],
      include: templateInclude,
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.directionTemplate.findUnique({
      where: { id },
      include: templateInclude,
    });
    if (!template) throw new NotFoundException('Direction template not found');
    return template;
  }

  async create(input: CreateDirectionTemplateInput) {
    await this.assertAudioAssets([
      input.directionAudioAssetId,
      input.exampleAudioAssetId,
    ]);

    return this.prisma.$transaction(async (transaction) => {
      const latest = await transaction.directionTemplate.aggregate({
        where: { part: input.part, language: input.language },
        _max: { version: true },
      });
      if (input.isDefault) {
        await transaction.directionTemplate.updateMany({
          where: {
            part: input.part,
            language: input.language,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }
      return transaction.directionTemplate.create({
        data: {
          ...input,
          version: (latest._max.version ?? 0) + 1,
        },
        include: templateInclude,
      });
    });
  }

  async update(id: string, input: UpdateDirectionTemplateInput) {
    await this.findOne(id);
    await this.assertAudioAssets([
      input.directionAudioAssetId,
      input.exampleAudioAssetId,
    ]);

    return this.prisma.directionTemplate.update({
      where: { id },
      data: input,
      include: templateInclude,
    });
  }

  async setDefault(id: string) {
    const template = await this.findOne(id);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.directionTemplate.updateMany({
        where: {
          part: template.part,
          language: template.language,
          isDefault: true,
        },
        data: { isDefault: false },
      });
      return transaction.directionTemplate.update({
        where: { id },
        data: { isDefault: true },
        include: templateInclude,
      });
    });
  }

  async resolve(query: ResolveDirectionQuery) {
    if (query.mode === 'NONE') return null;

    const template =
      query.mode === 'CUSTOM'
        ? await this.prisma.directionTemplate.findUnique({
            where: { id: query.templateId },
            include: templateInclude,
          })
        : await this.prisma.directionTemplate.findFirst({
            where: {
              part: query.part,
              language: query.language,
              isDefault: true,
            },
            include: templateInclude,
          });

    if (!template) {
      throw new NotFoundException(
        query.mode === 'CUSTOM'
          ? 'Custom direction template not found'
          : `No default ${query.language} direction exists for ${query.part}`,
      );
    }
    if (template.part !== query.part || template.language !== query.language) {
      throw new BadRequestException(
        'Direction template does not match the requested part and language',
      );
    }
    return template;
  }

  async remove(id: string) {
    const template = await this.findOne(id);
    if (template.isDefault) {
      throw new ConflictException('Default direction cannot be deleted');
    }
    if (template._count.sections > 0) {
      throw new ConflictException('Direction is in use and cannot be deleted');
    }
    await this.prisma.directionTemplate.delete({ where: { id } });
  }

  private async assertAudioAssets(ids: Array<string | null | undefined>) {
    const requested = [
      ...new Set(ids.filter((id): id is string => Boolean(id))),
    ];
    if (!requested.length) return;
    const count = await this.prisma.mediaAsset.count({
      where: { id: { in: requested }, type: 'AUDIO' },
    });
    if (count !== requested.length) {
      throw new BadRequestException(
        'Direction and example media must reference existing audio assets',
      );
    }
  }
}
