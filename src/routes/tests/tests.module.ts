import { Module } from '@nestjs/common';
import { TestDraftsController } from './test-drafts.controller';
import { TestDraftsService } from './test-drafts.service';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MediaModule } from '../media/media.module';
import { TestPublishingService } from './test-publishing.service';

@Module({
  imports: [MediaModule],
  controllers: [TestDraftsController],
  providers: [TestDraftsService, TestPublishingService, RolesGuard],
  exports: [TestDraftsService],
})
export class TestsModule {}
