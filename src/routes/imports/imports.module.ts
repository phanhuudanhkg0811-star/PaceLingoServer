import { Module } from '@nestjs/common';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { TestsModule } from '../tests/tests.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [TestsModule],
  controllers: [ImportsController],
  providers: [ImportsService, RolesGuard],
})
export class ImportsModule {}
