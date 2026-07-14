import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { open } from 'node:fs/promises';
import sharp from 'sharp';
import type { EnvConfig } from '../../shared/config/env';

export interface InspectedMedia {
  type: 'IMAGE' | 'AUDIO';
  mimeType: string;
  extension: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

@Injectable()
export class MediaFileInspectorService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async inspect(file: Express.Multer.File): Promise<InspectedMedia> {
    const detected = await detectFileType(file.path);
    if (!detected) {
      throw new UnsupportedMediaTypeException(
        'Only JPEG, PNG, WebP, GIF, MP3, WAV, OGG and M4A files are supported',
      );
    }

    const maxMegabytes = this.config.get(
      detected.type === 'IMAGE' ? 'MEDIA_MAX_IMAGE_MB' : 'MEDIA_MAX_AUDIO_MB',
      { infer: true },
    );
    if (file.size > maxMegabytes * 1024 * 1024) {
      throw new PayloadTooLargeException(
        `${detected.type.toLowerCase()} exceeds the ${maxMegabytes} MB limit`,
      );
    }

    if (detected.type === 'IMAGE') {
      const metadata = await sharp(file.path).metadata();
      if (!metadata.width || !metadata.height) {
        throw new BadRequestException(
          'Image dimensions could not be determined',
        );
      }
      return { ...detected, width: metadata.width, height: metadata.height };
    }

    const { parseFile } = await import('music-metadata');
    const metadata = await parseFile(file.path, { duration: true });
    const durationMs = metadata.format.duration
      ? Math.round(metadata.format.duration * 1000)
      : undefined;
    if (!durationMs) {
      throw new BadRequestException('Audio duration could not be determined');
    }
    return { ...detected, durationMs };
  }
}

async function detectFileType(
  path: string,
): Promise<Pick<InspectedMedia, 'type' | 'mimeType' | 'extension'> | null> {
  const handle = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(16);
    await handle.read(bytes, 0, bytes.length, 0);

    if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
      return { type: 'IMAGE', mimeType: 'image/jpeg', extension: 'jpg' };
    }
    if (
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      return { type: 'IMAGE', mimeType: 'image/png', extension: 'png' };
    }
    if (bytes.subarray(0, 4).toString('ascii') === 'GIF8') {
      return { type: 'IMAGE', mimeType: 'image/gif', extension: 'gif' };
    }
    if (
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { type: 'IMAGE', mimeType: 'image/webp', extension: 'webp' };
    }
    if (
      bytes.subarray(0, 3).toString('ascii') === 'ID3' ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    ) {
      return { type: 'AUDIO', mimeType: 'audio/mpeg', extension: 'mp3' };
    }
    if (
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WAVE'
    ) {
      return { type: 'AUDIO', mimeType: 'audio/wav', extension: 'wav' };
    }
    if (bytes.subarray(0, 4).toString('ascii') === 'OggS') {
      return { type: 'AUDIO', mimeType: 'audio/ogg', extension: 'ogg' };
    }
    if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
      return { type: 'AUDIO', mimeType: 'audio/mp4', extension: 'm4a' };
    }
    return null;
  } finally {
    await handle.close();
  }
}
