import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  database: {
    status: 'up' | 'down';
    driver: string;
    latencyMs: number;
    isConnected: boolean;
    error?: string;
  };
  system: {
    nodeVersion: string;
    platform: string;
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
    };
  };
  version: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let dbStatus: 'up' | 'down' = 'down';
    let dbLatency = -1;
    let dbError: string | undefined;

    try {
      if (this.dataSource.isInitialized) {
        // Run a lightweight query to test active round-trip connectivity
        await this.dataSource.query('SELECT 1');
        dbLatency = Date.now() - startTime;
        dbStatus = 'up';
      } else {
        dbError = 'DataSource is not initialized';
      }
    } catch (err: any) {
      dbLatency = Date.now() - startTime;
      dbError = err.message || 'Database query failed';
      this.logger.error(`Database health check failed: ${dbError}`, err.stack);
    }

    const isHealthy = dbStatus === 'up';
    const mem = process.memoryUsage();

    return {
      status: isHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: dbStatus,
        driver: this.dataSource.options.type,
        latencyMs: Math.max(0, dbLatency),
        isConnected: this.dataSource.isInitialized && dbStatus === 'up',
        ...(dbError ? { error: dbError } : {}),
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
          heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
          heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        },
      },
      version: '1.0.0',
    };
  }
}
