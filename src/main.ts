import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');
import morgan = require('morgan');
import * as dns from 'dns';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { buildCorsDelegate } from './common/cors';

// Prefer IPv4 for outbound DNS resolution. Some container platforms (e.g.
// Railway) advertise IPv6 routes for third-party hosts (Gmail SMTP, etc.)
// that aren't actually reachable, causing ENETUNREACH on the AAAA record.
// This affects Node 18+, which resolves DNS in the order returned by the OS
// rather than IPv4-first by default.
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app    = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true }); // rawBody: Stripe webhook signatures
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const isProd = config.get('NODE_ENV') === 'production';

  // Behind Railway's proxy every request otherwise appears to come from the
  // proxy itself, so all visitors shared ONE rate-limit bucket (QA BUG-47).
  // Trust exactly one hop so req.ip is the real client address.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

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

  // Portal origins for everything; the public interest form accepts any origin.
  app.enableCors(buildCorsDelegate(origins));

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

  // ── Swagger API Docs (only when NODE_ENV=development or explicitly enabled) ───
  // Fails closed: a deployment that forgets NODE_ENV no longer exposes docs.
  if (config.get('NODE_ENV') === 'development' || config.get('ENABLE_SWAGGER') === 'true') {
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
