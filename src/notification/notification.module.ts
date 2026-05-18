import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationController } from './notification.controller';
import { NotificationService }    from './notification.service';
import { Notification, NotificationSchema } from './notification.schema';
import { Student, StudentSchema } from '../student/student.schema';
import { User, UserSchema }       from '../user/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: Student.name,      schema: StudentSchema      },
      { name: User.name,         schema: UserSchema         },
    ]),
  ],
  controllers: [NotificationController],
  providers  : [NotificationService],
  exports    : [NotificationService],
})
export class NotificationModule {}
