import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
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
  createTestDraftSchema,
  type CreateTestDraftInput,
  testContentSchema,
  type TestContentInput,
  updateTestDraftSchema,
  type UpdateTestDraftInput,
} from './test-draft.schemas';
import { TestDraftsService } from './test-drafts.service';
import {
  audioSegmentsSchema,
  type AudioSegmentsInput,
  moveQuestionSchema,
  type MoveQuestionInput,
  reorderStimuliSchema,
  type ReorderStimuliInput,
  stimulusSchema,
  type StimulusInput,
  timelineSchema,
  type TimelineInput,
  updateGroupSchema,
  type UpdateGroupInput,
  updateQuestionSchema,
  type UpdateQuestionInput,
} from './test-editor.schemas';
import { TestPublishingService } from './test-publishing.service';

type AdminRequest = Request & { user: AuthUser };

@ApiTags('admin tests')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
@Controller('admin/tests')
export class TestDraftsController {
  constructor(
    private readonly testDrafts: TestDraftsService,
    private readonly publishing: TestPublishingService,
  ) {}

  @Get()
  list() {
    return this.testDrafts.list();
  }

  @Get(':id')
  findTree(@Param('id') id: string) {
    return this.testDrafts.findTree(id);
  }

  @Get(':id/validation')
  validate(@Param('id') id: string) {
    return this.testDrafts.validate(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createTestDraftSchema))
    input: CreateTestDraftInput,
    @Req() request: AdminRequest,
  ) {
    return this.testDrafts.create(input, request.user.id);
  }

  @Patch(':id')
  updateMetadata(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTestDraftSchema))
    input: UpdateTestDraftInput,
  ) {
    return this.testDrafts.updateMetadata(id, input);
  }

  @Put(':id/content')
  replaceContent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(testContentSchema)) input: TestContentInput,
  ) {
    return this.testDrafts.replaceContent(id, input);
  }

  @Patch('groups/:id')
  updateGroup(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateGroupSchema)) input: UpdateGroupInput,
  ) {
    return this.testDrafts.updateGroup(id, input);
  }

  @Post('groups/:id/questions')
  createQuestion(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateQuestionSchema))
    input: UpdateQuestionInput,
  ) {
    return this.testDrafts.createQuestion(id, input);
  }

  @Patch('questions/:id')
  updateQuestion(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateQuestionSchema))
    input: UpdateQuestionInput,
  ) {
    return this.testDrafts.updateQuestion(id, input);
  }

  @Post('questions/:id/duplicate')
  duplicateQuestion(@Param('id') id: string) {
    return this.testDrafts.duplicateQuestion(id);
  }

  @Post('questions/:id/move')
  moveQuestion(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveQuestionSchema)) input: MoveQuestionInput,
  ) {
    return this.testDrafts.moveQuestion(id, input);
  }

  @Delete('questions/:id')
  @HttpCode(204)
  removeQuestion(@Param('id') id: string) {
    return this.testDrafts.removeQuestion(id);
  }

  @Put('questions/:id/audio-segments')
  saveAudioSegments(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(audioSegmentsSchema)) input: AudioSegmentsInput,
  ) {
    return this.testDrafts.saveAudioSegments(id, input);
  }

  @Post('groups/:id/stimuli')
  createStimulus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(stimulusSchema)) input: StimulusInput,
  ) {
    return this.testDrafts.createStimulus(id, input);
  }

  @Put('groups/:id/stimuli/order')
  reorderStimuli(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reorderStimuliSchema))
    input: ReorderStimuliInput,
  ) {
    return this.testDrafts.reorderStimuli(id, input);
  }

  @Patch('stimuli/:id')
  updateStimulus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(stimulusSchema)) input: StimulusInput,
  ) {
    return this.testDrafts.updateStimulus(id, input);
  }

  @Delete('stimuli/:id')
  @HttpCode(204)
  removeStimulus(@Param('id') id: string) {
    return this.testDrafts.removeStimulus(id);
  }

  @Put(':id/timeline')
  saveTimeline(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(timelineSchema)) input: TimelineInput,
  ) {
    return this.testDrafts.saveTimeline(id, input);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.publishing.publish(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.testDrafts.remove(id);
  }
}
