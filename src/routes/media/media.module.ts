import { Module } from '@nestjs/common';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MediaController } from './media.controller';
import { MediaFileInspectorService } from './media-file-inspector.service';
import { MediaService } from './media.service';
import { R2StorageService } from './r2-storage.service';

@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaFileInspectorService,
    R2StorageService,
    RolesGuard,
  ],
  exports: [MediaService, R2StorageService],
})
export class MediaModule {}
