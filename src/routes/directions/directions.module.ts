import { Module } from '@nestjs/common';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { DirectionTemplatesController } from './direction-templates.controller';
import { DirectionTemplatesService } from './direction-templates.service';

@Module({
  controllers: [DirectionTemplatesController],
  providers: [DirectionTemplatesService, RolesGuard],
  exports: [DirectionTemplatesService],
})
export class DirectionsModule {}
