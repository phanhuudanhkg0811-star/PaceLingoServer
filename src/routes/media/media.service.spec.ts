/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../shared/database/prisma.service';
import type { MediaFileInspectorService } from './media-file-inspector.service';
import { MediaService } from './media.service';
import type { R2StorageService } from './r2-storage.service';

describe('MediaService', () => {
  const prisma = {
    mediaAsset: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };
  const storage = {
    upload: jest.fn(),
    delete: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(true),
  };
  const inspector = { inspect: jest.fn() };
  const service = new MediaService(
    prisma as unknown as PrismaService,
    storage as unknown as R2StorageService,
    inspector as unknown as MediaFileInspectorService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('stores inspected metadata instead of trusting the browser MIME type', async () => {
    const file = makeFile({ mimetype: 'application/octet-stream', size: 2048 });
    inspector.inspect.mockResolvedValue({
      type: 'IMAGE',
      mimeType: 'image/png',
      extension: 'png',
      width: 640,
      height: 480,
    });
    storage.upload.mockResolvedValue('https://media.example/image.png');
    prisma.mediaAsset.create.mockResolvedValue({ id: 'media-1' });

    await service.upload(file, { altText: 'Office photo' }, 'admin-1');

    expect(storage.upload).toHaveBeenCalledWith(
      file.path,
      expect.stringMatching(/^image\/\d{4}\/\d{2}\/.+\.png$/),
      'image/png',
    );
    expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'IMAGE',
          mimeType: 'image/png',
          sizeBytes: 2048n,
          width: 640,
          height: 480,
          createdById: 'admin-1',
        }),
      }),
    );
  });

  it('refuses to delete media that is referenced by test content', async () => {
    prisma.mediaAsset.findUnique.mockResolvedValue({
      id: 'media-1',
      storageKey: 'image/key.png',
      _count: {
        fullListeningTests: 0,
        listeningIntroTests: 0,
        stimulusItems: 1,
        directionAudioTemplates: 0,
        exampleAudioTemplates: 0,
        questionAudioSegments: 0,
      },
    });

    await expect(service.remove('media-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.mediaAsset.delete).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });
});

function makeFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'upload.fake',
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    size: 100,
    destination: '',
    filename: '',
    path: 'missing-temporary-file',
    buffer: Buffer.alloc(0),
    stream: null as never,
    ...overrides,
  };
}
