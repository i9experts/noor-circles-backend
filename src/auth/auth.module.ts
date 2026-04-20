import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';   //signin
import { PassportModule } from '@nestjs/passport';  //signin
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User, UserSchema } from '../user/user.schema';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';

import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    // User model is module mein available hoga
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    PassportModule,   //signin
    JwtModule.register({}),   //signin
    MailModule,
  ],
  controllers: [AuthController], // routes
  providers: [AuthService, JwtAccessStrategy],      // signin [JwtAccessStrategy]
})
export class AuthModule {}