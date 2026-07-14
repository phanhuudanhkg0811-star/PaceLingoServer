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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  createDirectionTemplateSchema,
  type CreateDirectionTemplateInput,
  directionTemplateListSchema,
  type DirectionTemplateListQuery,
  resolveDirectionSchema,
  type ResolveDirectionQuery,
  updateDirectionTemplateSchema,
  type UpdateDirectionTemplateInput,
} from './direction-template.schemas';
import { DirectionTemplatesService } from './direction-templates.service';

@ApiTags('admin directions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
@Controller('admin/directions')
export class DirectionTemplatesController {
  constructor(private readonly directions: DirectionTemplatesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(directionTemplateListSchema))
    query: DirectionTemplateListQuery,
  ) {
    return this.directions.list(query);
  }

  @Get('resolve')
  resolve(
    @Query(new ZodValidationPipe(resolveDirectionSchema))
    query: ResolveDirectionQuery,
  ) {
    return this.directions.resolve(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.directions.findOne(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createDirectionTemplateSchema))
    input: CreateDirectionTemplateInput,
  ) {
    return this.directions.create(input);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDirectionTemplateSchema))
    input: UpdateDirectionTemplateInput,
  ) {
    return this.directions.update(id, input);
  }

  @Post(':id/default')
  setDefault(@Param('id') id: string) {
    return this.directions.setDefault(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.directions.remove(id);
  }
}
