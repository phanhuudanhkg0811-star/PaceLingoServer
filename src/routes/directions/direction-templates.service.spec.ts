import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../shared/database/prisma.service';
import { DirectionTemplatesService } from './direction-templates.service';

describe('DirectionTemplatesService', () => {
  const prisma = {
    $transaction: jest.fn(),
    directionTemplate: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    mediaAsset: { count: jest.fn() },
  };
  const service = new DirectionTemplatesService(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => unknown) =>
        Promise.resolve(operation(prisma)),
    );
  });

  it('creates the next version and atomically changes the default', async () => {
    prisma.directionTemplate.aggregate.mockResolvedValue({
      _max: { version: 2 },
    });
    prisma.directionTemplate.updateMany.mockResolvedValue({ count: 1 });
    prisma.directionTemplate.create.mockResolvedValue({ id: 'direction-3' });

    await service.create({
      part: 'PART_3',
      directionText: 'Listen to each conversation.',
      language: 'en',
      isDefault: true,
    });

    const [createInput] = prisma.directionTemplate.create.mock
      .calls[0] as unknown as [
      { data: { version: number; isDefault: boolean } },
    ];
    expect(createInput.data).toEqual(
      expect.objectContaining({ version: 3, isDefault: true }),
    );
    expect(prisma.directionTemplate.updateMany).toHaveBeenCalled();
  });

  it('rejects non-audio media references', async () => {
    prisma.mediaAsset.count.mockResolvedValue(0);
    await expect(
      service.create({
        part: 'PART_1',
        directionText: 'Look at the photograph.',
        directionAudioAssetId: 'image-1',
        language: 'en',
        isDefault: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves the default template by part and language', async () => {
    prisma.directionTemplate.findFirst.mockResolvedValue({
      id: 'default-1',
      part: 'PART_1',
      language: 'en',
    });
    await expect(
      service.resolve({
        part: 'PART_1',
        mode: 'DEFAULT',
        language: 'en',
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'default-1' }));
  });

  it('does not delete a default template', async () => {
    prisma.directionTemplate.findUnique.mockResolvedValue({
      id: 'default-1',
      isDefault: true,
      _count: { sections: 0 },
    });
    await expect(service.remove('default-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
