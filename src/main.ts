import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import morgan = require('morgan');
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app    = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // HTTP request logging
  const isDev = config.get('NODE_ENV') !== 'production';
  app.use(morgan(isDev ? 'dev' : 'combined'));

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

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = config.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Server running → http://localhost:${port}/api/v1`);

  // Graceful shutdown — drain connections before exit
  const shutdown = async (signal: string) => {
    logger.warn(`${signal} received — shutting down gracefully…`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap();
