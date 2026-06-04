import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');
import morgan = require('morgan');
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app    = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const isProd = config.get('NODE_ENV') === 'production';

  // ── Security ─────────────────────────────────────────────────────────────────
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: isProd ? undefined : false,
  }));

  // ── Compression (gzip) ────────────────────────────────────────────────────────
  app.use(compression());

  // ── HTTP Logging ─────────────────────────────────────────────────────────────
  app.use(morgan(isProd ? 'combined' : 'dev'));

  // ── Global Prefix ─────────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── CORS ──────────────────────────────────────────────────────────────────────
  const origins = (config.get<string>('FRONTEND_URL') || 'http://localhost:5173')
    .split(',')
    .map((u) => u.trim());

  app.enableCors({
    origin        : origins,
    methods       : 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials   : true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Validation ────────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist           : true,
      forbidNonWhitelisted: true,
      transform           : true,
    }),
  );

  // ── Exception Filter & Response Interceptor ───────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ── Swagger API Docs (only in non-production or if explicitly enabled) ─────────
  if (!isProd || config.get('ENABLE_SWAGGER') === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Noor Circle API')
      .setDescription('Complete REST API for Noor Circle — Islamic Character Formation Platform')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('Auth',          'Authentication & account management')
      .addTag('Admin',         'Admin-only operations')
      .addTag('Murabbi',       'Murabbi portal endpoints')
      .addTag('Attendance',    'Session attendance')
      .addTag('Incentives',    'Student points & awards')
      .addTag('Performance',   'Murabbi performance reviews')
      .addTag('Parents',       'Parent engagement & WhatsApp')
      .addTag('Training',      'Murabbi training batches & modules')
      .addTag('Sessions',      'Curriculum & session records')
      .addTag('Lessons',       'Lesson plans')
      .addTag('Notifications', 'In-app notifications')
      .addTag('Reports',       'Analytics & reports')
      .addTag('Health',        'Service health checks')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: 'Noor Circle API Docs',
    });
    logger.log(`Swagger Docs → http://localhost:${config.get('PORT') || 3000}/api/docs`);
  }

  // ── Start ─────────────────────────────────────────────────────────────────────
  const port = config.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Server running → http://localhost:${port}/api/v1`);
  logger.log(`Health Check  → http://localhost:${port}/api/v1/health`);

  // ── Graceful Shutdown ─────────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.warn(`${signal} received — shutting down gracefully…`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap();
