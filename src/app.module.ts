import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './user/user.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    // ── Config — .env load karo ─────────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true }),

    // ── MongoDB ─────────────────────────────────────────────────────────────
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),

    // ── Rate Limiting — brute force attacks se bachao ───────────────────────
    // 100 requests per 60 seconds per IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // ── Feature Modules ─────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    MailModule,
  ],
  providers: [
    // Global rate limit guard — har route par apply hoga
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}