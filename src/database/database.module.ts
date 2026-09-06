import { Module } from '@nestjs/common';
import { MigrationRunnerService } from './services/migration-runner.service';
import { AdminMigrationsController } from './endpoints/admin-migrations.controller';

@Module({
  controllers: [AdminMigrationsController],
  providers: [MigrationRunnerService],
  exports: [MigrationRunnerService],
})
export class DatabaseModule {}
