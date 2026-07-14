import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
  importListSchema,
  type ImportListQuery,
  parseImportSchema,
  type ParseImportInput,
  publishImportSchema,
  type PublishImportInput,
  updateImportSchema,
  type UpdateImportInput,
} from './import.schemas';
import { ImportsService } from './imports.service';

type AdminRequest = Request & { user: AuthUser };

@ApiTags('admin imports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
@Controller('admin/imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(importListSchema)) query: ImportListQuery,
    @Req() request: AdminRequest,
  ) {
    return this.imports.list(query, request.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.imports.findOne(id, request.user.id);
  }

  @Post('parse')
  parse(
    @Body(new ZodValidationPipe(parseImportSchema)) input: ParseImportInput,
    @Req() request: AdminRequest,
  ) {
    return this.imports.parse(input, request.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateImportSchema)) input: UpdateImportInput,
    @Req() request: AdminRequest,
  ) {
    return this.imports.update(id, input, request.user.id);
  }

  @Post(':id/publish')
  publish(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(publishImportSchema))
    input: PublishImportInput,
    @Req() request: AdminRequest,
  ) {
    return this.imports.publish(id, input, request.user.id);
  }

  @Post(':id/discard')
  discard(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.imports.discard(id, request.user.id);
  }
}
