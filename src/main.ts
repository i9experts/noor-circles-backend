import { NestFactory }    from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService }  from '@nestjs/config';
import helmet             from 'helmet';
import { AppModule }      from './app.module';

async function bootstrap() {
  const app    = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet());

  // ── Global prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── CORS ───────────────────────────────────────────────────────────────────
  const origins = (config.get<string>('FRONTEND_URL') || 'http://localhost:5173')
    .split(',')
    .map((u) => u.trim());

  app.enableCors({
    origin     : origins,
    methods    : 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Global validation pipe ─────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist           : true,   // strip unknown fields
      forbidNonWhitelisted: true,   // 400 on extra fields
      transform           : true,   // auto-convert to DTO class
    }),
  );

  const port = config.get<number>('PORT') || 3000;
  await app.listen(port);
  logger.log(`Server running → http://localhost:${port}/api/v1`);
}

bootstrap();