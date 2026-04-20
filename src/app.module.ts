import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';

import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    // .env file load karo
    ConfigModule.forRoot({ isGlobal: true }),

    // MongoDB connect karo
    MongooseModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        uri: config.get('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),

    // Auth feature
    MailModule,
    AuthModule,
  ],
})
export class AppModule {}