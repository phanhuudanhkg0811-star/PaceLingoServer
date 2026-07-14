import type { PrismaService } from '../../shared/database/prisma.service';
import type { TestDraftsService } from '../tests/test-drafts.service';
import { ImportsService } from './imports.service';

describe('ImportsService', () => {
  const prisma = {
    importDraft: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  const tests = { findTree: jest.fn() };
  const service = new ImportsService(
    prisma as unknown as PrismaService,
    tests as unknown as TestDraftsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns the existing draft when the same content is parsed twice', async () => {
    prisma.importDraft.findUnique.mockResolvedValue({
      id: 'import-1',
      status: 'VALIDATED',
    });

    await expect(
      service.parse(
        { source: { title: 'Same JSON' }, skipInvalidQuestions: false },
        'admin-1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({ id: 'import-1', duplicate: true }),
    );
    expect(prisma.importDraft.create).not.toHaveBeenCalled();
  });

  it('does not create a second test when a published import is retried', async () => {
    prisma.importDraft.findFirst.mockResolvedValue({
      id: 'import-1',
      status: 'PUBLISHED',
      targetTestId: 'test-1',
    });
    tests.findTree.mockResolvedValue({ id: 'test-1', title: 'Existing test' });

    await expect(
      service.publish('import-1', { mode: 'CREATE_TEST' }, 'admin-1'),
    ).resolves.toEqual(expect.objectContaining({ duplicate: true }));
  });
});
