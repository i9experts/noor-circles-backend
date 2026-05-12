import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './user/user.module';
import { MailModule } from './mail/mail.module';
import { AdminModule } from './admin/admin.module';
import { MurabbiModule } from './murabbi/murabbi.module';
import { AttendanceModule } from './attendance/attendance.module';
import { TrainingNestModule } from './training/training.module';
import { LessonModule } from './lesson/lesson.module';
import { ReportModule } from './report/report.module';

@Module({
  imports: [
    // ── Config (.env) ──────────────────────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true }),

    // ── MongoDB ────────────────────────────────────────────────────────────────
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),

    // ── Rate Limiting: 100 req / 60 sec / IP ───────────────────────────────────
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // ── Feature Modules ────────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    MailModule,
    AdminModule,
    MurabbiModule,
    AttendanceModule,
    TrainingNestModule,
    LessonModule,
    ReportModule,
  ],
  providers: [
    // Apply rate limiting globally
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
