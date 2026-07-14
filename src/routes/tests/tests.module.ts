import { Module } from '@nestjs/common';
import { TestDraftsController } from './test-drafts.controller';
import { TestDraftsService } from './test-drafts.service';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MediaModule } from '../media/media.module';
import { TestPublishingService } from './test-publishing.service';
import { JwtModule } from '@nestjs/jwt';
import { CandidateTestsController } from './candidate-tests.controller';
import { CandidateRuntimeService } from './candidate-runtime.service';

@Module({
  imports: [MediaModule, JwtModule.register({})],
  controllers: [TestDraftsController, CandidateTestsController],
  providers: [
    TestDraftsService,
    TestPublishingService,
    CandidateRuntimeService,
    RolesGuard,
  ],
  exports: [TestDraftsService],
})
export class TestsModule {}
