import {
  Body,
  Controller,
  Get,
  Param,
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
  startCandidateRuntimeSchema,
  type StartCandidateRuntimeInput,
} from './candidate-runtime.schema';
import { CandidateRuntimeService } from './candidate-runtime.service';
import { AttemptsService } from '../attempts/attempts.service';

type CandidateRequest = Request & { user: AuthUser };

@ApiTags('candidate tests')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('tests')
export class CandidateTestsController {
  constructor(
    private readonly runtime: CandidateRuntimeService,
    private readonly attempts: AttemptsService,
  ) {}

  @Get()
  listPublished() {
    return this.runtime.listPublished();
  }

  @Get(':id/runtime')
  manifest(@Param('id') id: string) {
    return this.runtime.manifest(id);
  }

  @Post(':id/runtime')
  startOrResume(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(startCandidateRuntimeSchema))
    input: StartCandidateRuntimeInput,
    @Req() request: CandidateRequest,
  ) {
    return this.runtime.startOrResume(id, request.user.id, input.runtimeToken);
  }

  @Post(':id/attempts')
  startAttempt(@Param('id') id: string, @Req() request: CandidateRequest) {
    return this.attempts.startOrResume(id, request.user.id);
  }
}
