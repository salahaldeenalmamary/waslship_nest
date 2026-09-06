import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as child_process from 'child_process';
import { ALL_ENTITIES } from './entities';

// Load environment files with precedence
dotenv.config({ path: path.resolve(process.cwd(), `.env.${process.env.NODE_ENV || 'development'}.local`) });
dotenv.config({ path: path.resolve(process.cwd(), `.env.${process.env.NODE_ENV || 'development'}`) });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function isPostgresReachableSync(host: string, port: number): boolean {
  try {
    child_process.execSync(
      `node -e "const s = require('net').createConnection(${port}, '${host}'); s.on('connect', () => { s.destroy(); process.exit(0); }); s.on('error', () => process.exit(1)); s.setTimeout(600, () => { s.destroy(); process.exit(1); });"`,
      { stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

const getDataSourceOptions = (): DataSourceOptions => {
  const dbType = process.env.DB_TYPE || 'sqlite';
  const databaseUrl = process.env.DATABASE_URL;
  const wantsPostgres = dbType === 'postgres' || Boolean(databaseUrl);

  const migrations = [
    path.join(__dirname, 'migrations', '*{.ts,.js}'),
  ];

  if (wantsPostgres) {
    let hostToCheck = process.env.DB_HOST || 'localhost';
    let portToCheck = parseInt(process.env.DB_PORT || '5432', 10);

    if (databaseUrl) {
      try {
        const parsedUrl = new URL(databaseUrl);
        hostToCheck = parsedUrl.hostname;
        portToCheck = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 5432;
      } catch {
        // fallback
      }
    }

    const isLive = isPostgresReachableSync(hostToCheck, portToCheck);

    if (isLive) {
      if (databaseUrl) {
        return {
          type: 'postgres',
          url: databaseUrl,
          entities: ALL_ENTITIES,
          migrations,
          synchronize: process.env.DB_SYNCHRONIZE === 'true',
          migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
          logging: process.env.DB_LOGGING === 'true',
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        };
      }

      return {
        type: 'postgres',
        host: hostToCheck,
        port: portToCheck,
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres123',
        database: process.env.DB_DATABASE || 'waslship_db',
        entities: ALL_ENTITIES,
        migrations,
        synchronize: process.env.DB_SYNCHRONIZE === 'true',
        migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
        logging: process.env.DB_LOGGING === 'true',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      };
    } else {
      console.warn(
        `[TypeORM DataSource] PostgreSQL at ${hostToCheck}:${portToCheck} is not reachable. Using embedded SQLite (waslship.db) for CLI migrations.`,
      );
    }
  }

  return {
    type: 'sqlite',
    database: process.env.DB_DATABASE || 'waslship.db',
    entities: ALL_ENTITIES,
    migrations,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
    logging: process.env.DB_LOGGING === 'true',
  };
};

export default new DataSource(getDataSourceOptions());
