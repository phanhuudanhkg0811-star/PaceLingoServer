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

type AdminRequest = Request & { user: AuthUser };

@ApiTags('admin tests')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
@Controller('admin/tests')
export class TestDraftsController {
  constructor(private readonly testDrafts: TestDraftsService) {}

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

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.testDrafts.remove(id);
  }
}
