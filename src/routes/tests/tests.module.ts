import { Module } from '@nestjs/common';
import { TestDraftsController } from './test-drafts.controller';
import { TestDraftsService } from './test-drafts.service';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MediaModule } from '../media/media.module';
import { TestPublishingService } from './test-publishing.service';
import { JwtModule } from '@nestjs/jwt';
import { CandidateTestsController } from './candidate-tests.controller';
import { CandidateRuntimeService } from './candidate-runtime.service';
import { AttemptsController } from '../attempts/attempts.controller';
import { AttemptsService } from '../attempts/attempts.service';
import { AttemptReviewService } from '../attempts/attempt-review.service';
import { PracticeSessionsController } from '../attempts/practice-sessions.controller';
import { PracticeSessionsService } from '../attempts/practice-sessions.service';

@Module({
  imports: [MediaModule, JwtModule.register({})],
  controllers: [
    TestDraftsController,
    CandidateTestsController,
    AttemptsController,
    PracticeSessionsController,
  ],
  providers: [
    TestDraftsService,
    TestPublishingService,
    CandidateRuntimeService,
    AttemptsService,
    AttemptReviewService,
    PracticeSessionsService,
    RolesGuard,
  ],
  exports: [TestDraftsService],
})
export class TestsModule {}
