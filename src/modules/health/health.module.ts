import { Module } from '@nestjs/common';
import { HealthController } from './endpoints/health.controller';
import { HealthService } from './services/health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
