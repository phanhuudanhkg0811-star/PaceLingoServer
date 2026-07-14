import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { EnvConfig } from '../../shared/config/env';
import { PrismaService } from '../../shared/database/prisma.service';
import type { AuthUser } from '../../shared/auth/auth-user';

interface GoogleIdentity {
  subject: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async findOrCreateGoogleUser(identity: GoogleIdentity): Promise<AuthUser> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ googleSubject: identity.subject }, { email: identity.email }],
      },
    });

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            googleSubject: identity.subject,
            email: identity.email,
            name: identity.name,
            avatarUrl: identity.avatarUrl,
          },
        })
      : await this.prisma.user.create({
          data: {
            googleSubject: identity.subject,
            email: identity.email,
            name: identity.name,
            avatarUrl: identity.avatarUrl,
          },
        });
    return this.toAuthUser(user);
  }

  async createSession(user: AuthUser, familyId = randomUUID()) {
    const refreshToken = this.generateRefreshToken();
    const refreshExpiresAt = this.refreshExpiry();
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken: await this.createAccessToken(user),
      refreshToken,
      refreshExpiresAt,
      user,
    };
  }

  async rotateSession(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const existing = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) {
      if (existing) {
        await this.revokeFamily(existing.familyId);
      }
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    const nextToken = this.generateRefreshToken();
    const nextHash = this.hashToken(nextToken);
    const refreshExpiresAt = this.refreshExpiry();
    const replacementId = randomUUID();

    const rotated = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.refreshSession.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
          replacedById: replacementId,
        },
      });
      if (claimed.count !== 1) return false;

      await transaction.refreshSession.create({
        data: {
          id: replacementId,
          userId: existing.userId,
          familyId: existing.familyId,
          tokenHash: nextHash,
          expiresAt: refreshExpiresAt,
        },
      });
      return true;
    });

    if (!rotated) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Refresh token has already been used');
    }

    const user = this.toAuthUser(existing.user);
    return {
      accessToken: await this.createAccessToken(user),
      refreshToken: nextToken,
      refreshExpiresAt,
      user,
    };
  }

  async revokeSession(refreshToken: string) {
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private createAccessToken(user: AuthUser) {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.get('JWT_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_EXPIRES_IN', { infer: true }),
      },
    );
  }

  private generateRefreshToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshExpiry() {
    const expires = new Date();
    expires.setDate(
      expires.getDate() +
        this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }),
    );
    return expires;
  }

  private toAuthUser(user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role: AuthUser['role'];
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  }
}
