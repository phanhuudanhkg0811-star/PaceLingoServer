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
  type AttemptBatchInput,
  type AttemptProgressInput,
} from './attempt.schemas';
import { AttemptsService } from './attempts.service';

type AuthenticatedRequest = Request & { user: AuthUser };

@ApiTags('attempts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

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
