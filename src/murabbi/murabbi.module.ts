import { Module } from '@nestjs/common';
import { MurabbiController } from './murabbi.controller';
import { UsersModule }       from '../user/user.module';

@Module({
  imports    : [UsersModule],
  controllers: [MurabbiController],
})
export class MurabbiModule {}