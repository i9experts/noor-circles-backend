import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    // ── Config (loads .env) ──────────────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true }),

    // ── MongoDB ──────────────────────────────────────────────────────────────
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),

    // ── Rate limiting (brute-force protection on auth endpoints) ─────────────
    ThrottlerModule.forRoot([
      {
        ttl: 60000,   // 1 minute window
        limit: 10,    // max 10 requests per window per IP
      },
    ]),

    // ── Feature modules ──────────────────────────────────────────────────────
    UsersModule,
    MailModule,
    AuthModule,
  ],
})
export class AppModule {}