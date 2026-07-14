import { Module } from '@nestjs/common';
import { TestDraftsController } from './test-drafts.controller';
import { TestDraftsService } from './test-drafts.service';
import { RolesGuard } from '../../shared/guards/roles.guard';

@Module({
  controllers: [TestDraftsController],
  providers: [TestDraftsService, RolesGuard],
  exports: [TestDraftsService],
})
export class TestsModule {}
