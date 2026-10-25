import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationController } from './notification.controller';
import { NotificationService }    from './notification.service';
import { Notification, NotificationSchema } from './notification.schema';
import { Student, StudentSchema } from '../student/student.schema';
import { User, UserSchema }       from '../user/user.schema';
import { Attendance, AttendanceSchema } from '../attendance/attendance.schema';
import { Incentive, IncentiveSchema }   from '../incentive/incentive.schema';
import { Parent, ParentSchema }         from '../parent/parent.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: Student.name,      schema: StudentSchema      },
      { name: User.name,         schema: UserSchema         },
      { name: Attendance.name,   schema: AttendanceSchema   },
      { name: Incentive.name,    schema: IncentiveSchema    },
      { name: Parent.name,       schema: ParentSchema       },
    ]),
  ],
  controllers: [NotificationController],
  providers  : [NotificationService],
  exports    : [NotificationService],
})
export class NotificationModule {}
