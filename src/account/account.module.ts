import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/user.schema';
import { Parent, ParentSchema } from '../parent/parent.schema';
import { Interest, InterestSchema } from '../interest/interest.schema';
import { CourseModule } from '../course/course.module';
import { UsersModule } from '../user/user.module';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name,     schema: UserSchema     },
      { name: Parent.name,   schema: ParentSchema   },
      { name: Interest.name, schema: InterestSchema },
    ]),
    CourseModule,
    UsersModule,
  ],
  controllers: [AccountController],
  providers  : [AccountService],
})
export class AccountModule {}
