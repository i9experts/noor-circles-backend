import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // ── Security Headers (helmet) ──────────────────────────────────────────────
  app.use(helmet());

  // ── Global Route Prefix ────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── CORS ───────────────────────────────────────────────────────────────────
  const allowedOrigins = (config.get<string>('FRONTEND_URL') || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Global Validation Pipe ─────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,         // Extra fields automatically strip karo
      forbidNonWhitelisted: true, // Unknown fields par 400 throw karo
      transform: true,         // DTO class instances mein auto-convert karo
    }),
  );

  const port = config.get<number>('PORT') || 3000;
  await app.listen(port);
  logger.log(`Server running on: http://localhost:${port}/api/v1`);
}

bootstrap();