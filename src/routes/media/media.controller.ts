import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import type { AuthUser } from '../../shared/auth/auth-user';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  type CreateMediaFolderInput,
  createMediaFolderSchema,
  type MediaListQuery,
  mediaListQuerySchema,
  type MediaUploadInput,
  mediaUploadSchema,
  type UpdateMediaInput,
  type UpdateMediaFolderInput,
  updateMediaFolderSchema,
  updateMediaSchema,
} from './media.schemas';
import { MediaService } from './media.service';

const uploadInterceptor = FileInterceptor('file', {
  storage: diskStorage({
    destination: tmpdir(),
    filename: (_request, _file, callback) =>
      callback(null, `pace-lingo-${randomUUID()}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

type AdminRequest = Request & { user: AuthUser };

@ApiTags('admin media')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
@Controller('admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(mediaListQuerySchema)) query: MediaListQuery,
  ) {
    return this.media.list(query);
  }

  @Get('folders')
  listFolders() {
    return this.media.listFolders();
  }

  @Post('folders')
  createFolder(
    @Body(new ZodValidationPipe(createMediaFolderSchema))
    input: CreateMediaFolderInput,
    @Req() request: AdminRequest,
  ) {
    return this.media.createFolder(input, request.user.id);
  }

  @Patch('folders/:id')
  updateFolder(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMediaFolderSchema))
    input: UpdateMediaFolderInput,
  ) {
    return this.media.updateFolder(id, input);
  }

  @Delete('folders/:id')
  @HttpCode(204)
  removeFolder(@Param('id') id: string) {
    return this.media.removeFolder(id);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadInterceptor)
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(mediaUploadSchema)) input: MediaUploadInput,
    @Req() request: AdminRequest,
  ) {
    return this.media.upload(file, input, request.user.id);
  }

  @Get(':id/usages')
  usages(@Param('id') id: string) {
    return this.media.usages(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.media.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMediaSchema)) input: UpdateMediaInput,
  ) {
    return this.media.update(id, input);
  }

  @Post(':id/replace')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadInterceptor)
  replace(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(mediaUploadSchema)) input: MediaUploadInput,
  ) {
    return this.media.replace(id, file, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.media.remove(id);
  }
}
