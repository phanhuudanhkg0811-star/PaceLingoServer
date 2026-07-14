import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../../shared/auth/auth-user';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  attemptBatchSchema,
  attemptProgressSchema,
  retryAttemptSchema,
  type AttemptBatchInput,
  type AttemptProgressInput,
  type RetryAttemptInput,
} from './attempt.schemas';
import { AttemptReviewService } from './attempt-review.service';
import { AttemptsService } from './attempts.service';
import { PracticeSessionsService } from './practice-sessions.service';

type AuthenticatedRequest = Request & { user: AuthUser };

@ApiTags('attempts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('attempts')
export class AttemptsController {
  constructor(
    private readonly attempts: AttemptsService,
    private readonly reviews: AttemptReviewService,
    private readonly practice: PracticeSessionsService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.reviews.list(request.user.id);
  }

  @Get(':id/review')
  review(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.reviews.review(id, request.user.id);
  }

  @Post(':id/retry')
  retry(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(retryAttemptSchema)) input: RetryAttemptInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.practice.createFromWrongAnswers(id, request.user.id, input);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.attempts.findOne(id, request.user.id);
  }

  @Patch(':id/answers')
  saveBatch(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(attemptBatchSchema)) input: AttemptBatchInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.attempts.saveBatch(id, request.user.id, input);
  }

  @Patch(':id/progress')
  saveProgress(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(attemptProgressSchema))
    input: AttemptProgressInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.attempts.saveProgress(id, request.user.id, input);
  }

  @Post(':id/submit')
  submit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(attemptBatchSchema)) input: AttemptBatchInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.attempts.submit(id, request.user.id, input);
  }
}
