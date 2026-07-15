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
import { Roles } from '../../shared/decorators/roles.decorator';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  contactFeedbackSchema,
  feedbackStatusSchema,
  questionErrorSchema,
  type ContactFeedbackInput,
  type FeedbackStatusInput,
  type QuestionErrorInput,
} from './feedback.schemas';
import { FeedbackService } from './feedback.service';

type AuthenticatedRequest = Request & { user: AuthUser };

@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post('contact')
  contact(
    @Body(new ZodValidationPipe(contactFeedbackSchema))
    input: ContactFeedbackInput,
  ) {
    return this.feedback.createContact(input);
  }

  @Post('question-error')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  questionError(
    @Body(new ZodValidationPipe(questionErrorSchema)) input: QuestionErrorInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.feedback.createQuestionError(request.user.id, input);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  list() {
    return this.feedback.list();
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(feedbackStatusSchema))
    input: FeedbackStatusInput,
  ) {
    return this.feedback.updateStatus(id, input);
  }
}
