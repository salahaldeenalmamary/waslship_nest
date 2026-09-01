import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { Request, Response } from 'express';
import { join } from 'path';

async function bootstrap() {
  const logger = new Logger('WaslShipBootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable CORS with full support for web browsers, React Admin panels, and credentials
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or any browser origin
      callback(null, true);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Access-Token',
      'X-Api-Key',
      'Access-Control-Allow-Headers',
      'Access-Control-Allow-Origin',
    ],
    exposedHeaders: ['Content-Disposition', 'Content-Length', 'X-Total-Count'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Serve static files for uploads
  app.useStaticAssets(join(process.cwd(), 'public'), {
    prefix: '/',
  });

  // Global Pipelines
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('WaslShip Logistics & Shipping API')
    .setDescription(
      `
## WaslShip Modular Monolith API Platform
Comprehensive logistics platform rewritten in NestJS & TypeORM.

### Available Subsystems:
- **Authentication**: JWT Auth, OTP verification, password recovery.
- **User & Address Management**: Merchant profiles, pickup/delivery addresses, regional geocoding.
- **Shipments & OTO Carrier Integration**: Shipment creation, bulk orders, delivery fees, tracking & webhook signature processing.
- **Merchant Wallet & Financials**: Balance ledgers, COD settlements, instant deposits, bank transfer verification.
- **Push Notifications & Devices**: FCM device registration, system notification logs.

### Default Seeded Credentials:
- **Admin**: \`admin@waslship.com\` / \`AdminPass123!\`
- **Merchant**: \`merchant@waslship.com\` / \`Merchant123!\` (Pre-funded with 1500 SAR)
      `,
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('Authentication', 'Merchant & Admin registration & login endpoints')
    .addTag('User Profile & Addresses', 'Merchant details and address book')
    .addTag('Shipments (Merchant)', 'Create, track, hold, cancel shipments')
    .addTag('Public Tracking & Carrier Pricing', 'Public tracking and rate calculator')
    .addTag('Merchant Wallet & Transactions', 'Balance top-up, COD ledger, bank transfers')
    .addTag('Admin User Management', 'Admin user control and roles')
    .addTag('Admin Operations & Webhooks', 'Admin shipment oversight and OTO webhooks')
    .addTag('Admin Bank Transfers & Financials', 'Bank transfer approvals')
    .addTag('Notifications & FCM Push', 'Notifications and device tokens')
    .addTag('Storage & Media', 'Upload and manage media files')
    .addTag('System & Health', 'Health checks and database connectivity monitoring')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'WaslShip API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
    },
  });

  // Redirect root '/' to '/docs' so the user sees the interactive Swagger directly!
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/', (req: Request, res: Response) => {
    res.redirect('/docs');
  });

  const port = 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`=======================================================`);
  logger.log(` WaslShip NestJS Monolith running on port ${port}`);
  logger.log(` Interactive Swagger UI at: http://localhost:${port}/docs`);
  logger.log(`=======================================================`);
}
bootstrap();
