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
  practiceSubmitSchema,
  type PracticeSubmitInput,
} from './attempt.schemas';
import { PracticeSessionsService } from './practice-sessions.service';

type AuthenticatedRequest = Request & { user: AuthUser };

@ApiTags('practice sessions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('practice-sessions')
export class PracticeSessionsController {
  constructor(private readonly sessions: PracticeSessionsService) {}

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.sessions.findOne(id, request.user.id);
  }

  @Post(':id/submit')
  submit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(practiceSubmitSchema))
    input: PracticeSubmitInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.sessions.submit(id, request.user.id, input);
  }
}
