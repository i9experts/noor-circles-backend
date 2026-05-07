import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService }    from './admin.service';
import { UsersModule }     from '../user/user.module';

@Module({
  imports    : [UsersModule], // gives access to UsersService + User model
  controllers: [AdminController],
  providers  : [AdminService],
})
export class AdminModule {}