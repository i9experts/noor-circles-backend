import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1'); // sab routes /api/v1 se start honge

  app.enableCors({
    origin: 'http://localhost:5173', // 👈 frontend URL
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-reset-email',      // ✅ yeh add karo — custom header allow karo
    ],
  });
  // Ye line DTO validation ON karta hai
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  await app.listen(3000);
  console.log('Server chal raha hai: http://localhost:3000');
}
bootstrap();