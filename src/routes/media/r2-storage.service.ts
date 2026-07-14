import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import type { EnvConfig } from '../../shared/config/env';

@Injectable()
export class R2StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string | null;
  private readonly publicUrl: string | null;

  constructor(config: ConfigService<EnvConfig, true>) {
    const accountId = config.get('R2_ACCOUNT_ID', { infer: true });
    const accessKeyId = config.get('R2_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('R2_SECRET_ACCESS_KEY', { infer: true });
    this.bucket = config.get('R2_BUCKET', { infer: true }) ?? null;
    this.publicUrl =
      config.get('R2_PUBLIC_URL', { infer: true })?.replace(/\/$/, '') ?? null;

    this.client =
      accountId && accessKeyId && secretAccessKey
        ? new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }

  async upload(path: string, storageKey: string, contentType: string) {
    const { client, bucket } = this.requireConfiguration();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: createReadStream(path),
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return this.publicObjectUrl(storageKey);
  }

  async uploadBytes(body: Uint8Array, storageKey: string, contentType: string) {
    const { client, bucket } = this.requireConfiguration();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return this.publicObjectUrl(storageKey);
  }

  async delete(storageKey: string) {
    const { client, bucket } = this.requireConfiguration();
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }),
    );
  }

  isConfigured() {
    return Boolean(this.client && this.bucket && this.publicUrl);
  }

  private publicObjectUrl(storageKey: string) {
    if (!this.publicUrl) {
      throw new ServiceUnavailableException('R2_PUBLIC_URL is not configured');
    }
    return `${this.publicUrl}/${storageKey
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`;
  }

  private requireConfiguration() {
    if (!this.client || !this.bucket || !this.publicUrl) {
      throw new ServiceUnavailableException(
        'Cloudflare R2 is not configured. Set all R2 environment variables.',
      );
    }
    return { client: this.client, bucket: this.bucket };
  }
}
