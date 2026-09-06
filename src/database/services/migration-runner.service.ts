import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

export interface MigrationInfo {
  name: string;
  timestamp: number;
  isExecuted: boolean;
}

@Injectable()
export class MigrationRunnerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigrationRunnerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const shouldRunOnStartup =
      this.configService.get<string>('DB_MIGRATIONS_RUN', 'false') === 'true';

    if (shouldRunOnStartup) {
      this.logger.log('DB_MIGRATIONS_RUN is enabled. Checking and executing pending migrations...');
      try {
        const result = await this.runPendingMigrations();
        this.logger.log(
          `Migrations executed successfully: ${result.executedMigrations.length} applied.`,
        );
      } catch (err: any) {
        this.logger.error(`Failed to execute migrations on startup: ${err.message}`, err.stack);
      }
    }
  }

  /**
   * Get the list of all registered migrations and their execution status
   */
  async getMigrationStatus(): Promise<{
    hasPending: boolean;
    executedCount: number;
    pendingCount: number;
    migrations: MigrationInfo[];
  }> {
    const registeredMigrations = this.dataSource.migrations || [];
    
    // Get executed migrations from database table
    let executedMigrationNames: string[] = [];
    try {
      const queryRunner = this.dataSource.createQueryRunner();
      const hasTable = await queryRunner.hasTable('migrations');
      if (hasTable) {
        const rows: any[] = await queryRunner.query('SELECT * FROM migrations');
        executedMigrationNames = rows.map((r) => r.name || r.migration_name);
      }
      await queryRunner.release();
    } catch {
      // In case migrations table doesn't exist yet
    }

    const migrations: MigrationInfo[] = registeredMigrations.map((m) => {
      const isExecuted = executedMigrationNames.includes(m.name || m.constructor.name);
      const timestampMatch = (m.name || m.constructor.name).match(/\d+/);
      return {
        name: m.name || m.constructor.name,
        timestamp: timestampMatch ? parseInt(timestampMatch[0], 10) : 0,
        isExecuted,
      };
    });

    const pendingCount = migrations.filter((m) => !m.isExecuted).length;
    const executedCount = migrations.filter((m) => m.isExecuted).length;

    return {
      hasPending: pendingCount > 0,
      executedCount,
      pendingCount,
      migrations,
    };
  }

  /**
   * Execute pending migrations
   */
  async runPendingMigrations(): Promise<{
    success: boolean;
    executedMigrations: string[];
  }> {
    this.logger.log('Starting migration execution...');
    const executed = await this.dataSource.runMigrations({ transaction: 'all' });
    const executedNames = executed.map((m) => m.name || m.constructor.name);
    this.logger.log(`Executed ${executed.length} migration(s): ${executedNames.join(', ')}`);
    return {
      success: true,
      executedMigrations: executedNames,
    };
  }

  /**
   * Revert the most recently executed migration
   */
  async revertLastMigration(): Promise<{
    success: boolean;
    message: string;
  }> {
    this.logger.log('Reverting last executed migration...');
    await this.dataSource.undoLastMigration({ transaction: 'all' });
    return {
      success: true,
      message: 'Last migration reverted successfully.',
    };
  }
}
