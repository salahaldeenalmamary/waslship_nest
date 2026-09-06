import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../../modules/auth/roles.guard';
import { UserRole } from '../../modules/users/enums/user.enum';
import { MigrationRunnerService } from '../services/migration-runner.service';

@ApiTags('Admin Database Migrations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller('api/admin/migrations')
export class AdminMigrationsController {
  constructor(private readonly migrationRunner: MigrationRunnerService) {}

  @Get()
  @ApiOperation({ summary: 'Get status of database migrations (executed vs pending)' })
  async getStatus() {
    return this.migrationRunner.getMigrationStatus();
  }

  @Post('run')
  @ApiOperation({ summary: 'Execute all pending database migrations' })
  async runMigrations() {
    return this.migrationRunner.runPendingMigrations();
  }

  @Post('revert')
  @ApiOperation({ summary: 'Revert the last executed database migration' })
  async revertMigration() {
    return this.migrationRunner.revertLastMigration();
  }
}
