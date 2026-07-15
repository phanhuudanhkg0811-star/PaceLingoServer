import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): { status: string; service: string; timestamp: string } {
    return this.appService.getHealth();
  }

  @Get('health/live')
  getLiveness(): { status: string; service: string; timestamp: string } {
    return this.appService.getHealth();
  }

  @Get('health/ready')
  async getReadiness() {
    const readiness = await this.appService.getReadiness();
    if (readiness.status !== 'ready') {
      throw new ServiceUnavailableException(readiness);
    }
    return readiness;
  }
}
