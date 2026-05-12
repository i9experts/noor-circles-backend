import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app    = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.setGlobalPrefix('api/v1');

  const origins = (config.get<string>('FRONTEND_URL') || 'http://localhost:5173')
    .split(',')
    .map((u) => u.trim());

  app.enableCors({
    origin        : origins,
    methods       : 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials   : true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist           : true,
      forbidNonWhitelisted: true,
      transform           : true,
    }),
  );

  // FIX: Register global exception filter (was missing from main.ts)
  app.useGlobalFilters(new HttpExceptionFilter());

  // FIX: Add global response interceptor for consistent { success, message, data } shape
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = config.get<number>('PORT') || 3000;
  await app.listen(port);
  logger.log(`✅  Server running → http://localhost:${port}/api/v1`);
}

bootstrap();
