import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { EnvConfig } from '../../shared/config/env';
import { PrismaService } from '../../shared/database/prisma.service';
import { R2StorageService } from '../media/r2-storage.service';

interface RuntimeClaims {
  purpose: 'candidate-runtime';
  sub: string;
  testId: string;
  testVersionId: string;
  listeningStartedAt: string;
}

@Injectable()
export class CandidateRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  listPublished() {
    return this.prisma.test.findMany({
      where: {
        status: 'PUBLISHED',
        currentPublishedVersionId: { not: null },
      },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        totalQuestions: true,
        durationMinutes: true,
        publishedAt: true,
        currentPublishedVersion: {
          select: { id: true, version: true, schemaVersion: true },
        },
      },
    });
  }

  async manifest(testId: string) {
    const version = await this.findPublishedVersion(testId);
    return this.toManifest(version, new Date());
  }

  async startOrResume(testId: string, userId: string, runtimeToken?: string) {
    const version = await this.findPublishedVersion(testId);
    const now = new Date();
    let listeningStartedAt = now;

    if (runtimeToken) {
      const claims = await this.verifyToken(runtimeToken);
      if (
        claims.sub !== userId ||
        claims.testId !== testId ||
        claims.testVersionId !== version.id
      ) {
        throw new UnauthorizedException(
          'Runtime token does not match this user or test version',
        );
      }
      listeningStartedAt = new Date(claims.listeningStartedAt);
      if (Number.isNaN(listeningStartedAt.getTime())) {
        throw new UnauthorizedException('Runtime token has an invalid start');
      }
    }

    const token =
      runtimeToken ??
      (await this.createToken({
        purpose: 'candidate-runtime',
        sub: userId,
        testId,
        testVersionId: version.id,
        listeningStartedAt: listeningStartedAt.toISOString(),
      }));
    const expectedAudioPositionMs = Math.max(
      0,
      now.getTime() - listeningStartedAt.getTime(),
    );

    return {
      ...this.toManifest(version, now),
      runtimeToken: token,
      listeningStartedAt: listeningStartedAt.toISOString(),
      expectedAudioPositionMs,
    };
  }

  private async findPublishedVersion(testId: string) {
    const test = await this.prisma.test.findFirst({
      where: { id: testId, status: 'PUBLISHED' },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        totalQuestions: true,
        durationMinutes: true,
        currentPublishedVersion: {
          select: {
            id: true,
            version: true,
            status: true,
            schemaVersion: true,
            candidatePayloadStorageKey: true,
            candidatePayloadHash: true,
          },
        },
      },
    });
    if (!test?.currentPublishedVersion) {
      throw new NotFoundException('Published test version was not found');
    }
    if (
      test.currentPublishedVersion.status !== 'PUBLISHED' ||
      !test.currentPublishedVersion.candidatePayloadStorageKey ||
      !test.currentPublishedVersion.candidatePayloadHash
    ) {
      throw new BadRequestException('Published candidate snapshot is missing');
    }
    return {
      ...test.currentPublishedVersion,
      test: {
        id: test.id,
        title: test.title,
        description: test.description,
        type: test.type,
        totalQuestions: test.totalQuestions,
        durationMinutes: test.durationMinutes,
      },
    };
  }

  private toManifest(
    version: Awaited<
      ReturnType<CandidateRuntimeService['findPublishedVersion']>
    >,
    now: Date,
  ) {
    return {
      test: version.test,
      testVersion: {
        id: version.id,
        version: version.version,
        schemaVersion: version.schemaVersion,
        candidatePayloadHash: version.candidatePayloadHash,
      },
      candidateUrl: this.storage.objectUrl(version.candidatePayloadStorageKey!),
      serverNow: now.toISOString(),
    };
  }

  private createToken(claims: RuntimeClaims) {
    const secret = this.config.get('JWT_SECRET', { infer: true });
    return this.jwt.signAsync(claims, {
      secret,
      expiresIn: '4h',
    });
  }

  private async verifyToken(token: string) {
    try {
      const claims = await this.jwt.verifyAsync<RuntimeClaims>(token, {
        secret: this.config.get('JWT_SECRET', { infer: true }),
      });
      if (claims.purpose !== 'candidate-runtime') throw new Error('purpose');
      return claims;
    } catch {
      throw new UnauthorizedException('Runtime token is invalid or expired');
    }
  }
}
