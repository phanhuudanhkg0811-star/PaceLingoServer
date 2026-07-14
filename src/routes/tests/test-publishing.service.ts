import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client';
import type { EnvConfig } from '../../shared/config/env';
import { PrismaService } from '../../shared/database/prisma.service';
import { R2StorageService } from '../media/r2-storage.service';
import { TestDraftsService } from './test-drafts.service';

type TestTree = Awaited<ReturnType<TestDraftsService['findTree']>>;
type DefaultDirection = Prisma.DirectionTemplateGetPayload<{
  include: { directionAudioAsset: true; exampleAudioAsset: true };
}>;

@Injectable()
export class TestPublishingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tests: TestDraftsService,
    private readonly storage: R2StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async publish(testId: string) {
    const test = await this.tests.findTree(testId);
    if (test.status !== 'DRAFT') {
      throw new BadRequestException('Only draft tests can be published');
    }
    const validation = await this.tests.validate(testId);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Test draft failed publish validation',
        validation,
      });
    }

    const defaultParts = test.sections
      .filter((section) => section.directionMode === 'DEFAULT' && section.part)
      .map((section) => section.part!);
    const defaults = await this.prisma.directionTemplate.findMany({
      where: {
        part: { in: defaultParts },
        language: 'en',
        isDefault: true,
      },
      include: { directionAudioAsset: true, exampleAudioAsset: true },
    });
    const snapshots = buildSnapshots(test, defaults);
    const latest = await this.prisma.testVersion.aggregate({
      where: { testId },
      _max: { version: true },
    });
    const version = (latest._max.version ?? 0) + 1;
    const baseKey = `tests/${testId}/v${version}`;
    const encryptionSecret = this.config.get('JWT_SECRET', { infer: true });
    const files = [
      snapshotFile('candidate', snapshots.candidate, baseKey),
      encryptedSnapshotFile(
        'answer-key',
        snapshots.answerKey,
        baseKey,
        encryptionSecret,
      ),
      encryptedSnapshotFile(
        'review',
        snapshots.review,
        baseKey,
        encryptionSecret,
      ),
    ];
    const uploaded: string[] = [];

    try {
      const urls: Record<string, string> = {};
      for (const file of files) {
        urls[file.name] = await this.storage.uploadBytes(
          file.body,
          file.key,
          file.contentType,
        );
        uploaded.push(file.key);
      }

      const testVersion = await this.prisma.$transaction(
        async (transaction) => {
          const created = await transaction.testVersion.create({
            data: {
              testId,
              version,
              status: 'PUBLISHED',
              schemaVersion: 1,
              candidatePayloadStorageKey: files[0].key,
              candidatePayloadHash: files[0].hash,
              answerKeyStorageKey: files[1].key,
              answerKeyHash: files[1].hash,
              reviewPayloadStorageKey: files[2].key,
              reviewPayloadHash: files[2].hash,
              publishedAt: new Date(),
            },
          });
          await transaction.test.update({
            where: { id: testId },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              currentPublishedVersionId: created.id,
            },
          });
          return created;
        },
      );

      return {
        version: testVersion,
        candidateUrl: urls.candidate,
      };
    } catch (error) {
      await Promise.all(
        uploaded.map((key) => this.storage.delete(key).catch(() => undefined)),
      );
      throw error;
    }
  }
}

export function buildSnapshots(test: TestTree, defaults: DefaultDirection[]) {
  const defaultByPart = new Map(defaults.map((item) => [item.part, item]));
  const candidate = {
    schemaVersion: 1,
    test: {
      id: test.id,
      title: test.title,
      description: test.description,
      type: test.type,
      durationMinutes: test.durationMinutes,
      totalQuestions: test.totalQuestions,
      fullListeningAudio: mediaPayload(test.fullListeningAudio),
    },
    sections: test.sections.map((section) => {
      const direction =
        section.directionMode === 'NONE'
          ? null
          : section.directionMode === 'CUSTOM'
            ? section.directionTemplate
            : section.part
              ? defaultByPart.get(section.part)
              : null;
      return {
        id: section.id,
        title: section.title,
        kind: section.kind,
        part: section.part,
        order: section.order,
        durationMinutes: section.durationMinutes,
        directionMode: section.directionMode,
        direction: direction
          ? {
              id: direction.id,
              text: direction.directionText,
              audio: mediaPayload(direction.directionAudioAsset),
              exampleHtml: direction.exampleHtml,
              exampleAudio: mediaPayload(direction.exampleAudioAsset),
            }
          : null,
        questionGroups: section.questionGroups.map((group) => ({
          id: group.id,
          type: group.type,
          title: group.title,
          order: group.order,
          stimuli: group.stimuli.map((stimulus) => ({
            id: stimulus.id,
            type: stimulus.type,
            contentHtml: stimulus.contentHtml,
            altText: stimulus.altText,
            order: stimulus.order,
            media: mediaPayload(stimulus.mediaAsset),
          })),
          questions: group.questions.map((question) => ({
            id: question.id,
            number: question.number,
            promptHtml: question.promptHtml,
            order: question.order,
            options: question.options.map((option) => ({
              id: option.id,
              label: option.label,
              contentHtml: option.contentHtml,
              order: option.order,
            })),
          })),
        })),
      };
    }),
    timeline: test.timelineEvents.map((event) => ({
      id: event.id,
      type: event.type,
      startMs: event.startMs,
      endMs: event.endMs,
      order: event.order,
      sectionId: event.sectionId,
      groupId: event.groupId,
      questionId: event.questionId,
    })),
  };

  const answerKey = {
    schemaVersion: 1,
    testId: test.id,
    scoreConversion: test.scoreConversionProfile
      ? {
          name: test.scoreConversionProfile.name,
          source: test.scoreConversionProfile.source,
          version: test.scoreConversionProfile.version,
          isOfficial: test.scoreConversionProfile.isOfficial,
          listeningMappingJson:
            test.scoreConversionProfile.listeningMappingJson,
          readingMappingJson: test.scoreConversionProfile.readingMappingJson,
        }
      : null,
    questions: test.sections.flatMap((section) =>
      section.questionGroups.flatMap((group) =>
        group.questions.map((question) => ({
          questionId: question.id,
          number: question.number,
          kind: section.kind,
          part: section.part,
          correctOptionId:
            question.options.find((option) => option.isCorrect)?.id ?? null,
        })),
      ),
    ),
  };

  const review = {
    schemaVersion: 1,
    testId: test.id,
    groups: test.sections.flatMap((section) =>
      section.questionGroups.map((group) => ({
        groupId: group.id,
        transcriptHtml: group.transcriptHtml,
        questions: group.questions.map((question) => ({
          questionId: question.id,
          explanationHtml: question.explanationHtml,
          grammarTopic: question.grammarTopic,
          vocabularyTags: question.vocabularyTags,
          difficulty: question.difficulty,
          audioSegments: question.audioSegments.map((segment) => ({
            id: segment.id,
            segmentType: segment.segmentType,
            startMs: segment.startMs,
            endMs: segment.endMs,
            audio: mediaPayload(segment.audioAsset),
          })),
        })),
      })),
    ),
  };

  return { candidate, answerKey, review };
}

function mediaPayload(
  media:
    | {
        id: string;
        type: string;
        url: string;
        mimeType: string;
        width: number | null;
        height: number | null;
        durationMs: number | null;
        altText: string | null;
      }
    | null
    | undefined,
) {
  return media
    ? {
        id: media.id,
        type: media.type,
        url: media.url,
        mimeType: media.mimeType,
        width: media.width,
        height: media.height,
        durationMs: media.durationMs,
        altText: media.altText,
      }
    : null;
}

function snapshotFile(name: string, payload: unknown, baseKey: string) {
  const json = JSON.stringify(payload);
  return {
    name,
    body: Buffer.from(json, 'utf8'),
    key: `${baseKey}/${name}.json`,
    hash: createHash('sha256').update(json).digest('hex'),
    contentType: 'application/json; charset=utf-8',
  };
}

function encryptedSnapshotFile(
  name: string,
  payload: unknown,
  baseKey: string,
  secret: string,
) {
  const json = JSON.stringify(payload);
  return {
    name,
    body: encryptSnapshot(json, secret),
    key: `${baseKey}/${name}.enc`,
    hash: createHash('sha256').update(json).digest('hex'),
    contentType: 'application/octet-stream',
  };
}

export function encryptSnapshot(plainText: string, secret: string) {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.from(
    JSON.stringify({
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    }),
    'utf8',
  );
}

export function decryptSnapshot(encrypted: Uint8Array, secret: string) {
  const envelope = JSON.parse(Buffer.from(encrypted).toString('utf8')) as {
    algorithm: string;
    iv: string;
    tag: string;
    ciphertext: string;
  };
  if (envelope.algorithm !== 'aes-256-gcm') {
    throw new Error('Unsupported snapshot encryption algorithm');
  }
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
