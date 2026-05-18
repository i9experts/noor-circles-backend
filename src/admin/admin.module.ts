import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService }    from './admin.service';
import { UsersModule }          from '../user/user.module';
import { NotificationModule }   from '../notification/notification.module';
import { AnnouncementModule }   from '../announcement/announcement.module';
import { Neighbourhood, NeighbourhoodSchema } from '../neighbourhood/neighbourhood.schema';
import { Circle, CircleSchema }               from '../circle/circle.schema';
import { Student, StudentSchema }             from '../student/student.schema';
import { Attendance, AttendanceSchema }       from '../attendance/attendance.schema';
import { Parent, ParentSchema }               from '../parent/parent.schema';

@Module({
  imports: [
    UsersModule,
    NotificationModule,
    AnnouncementModule,
    MongooseModule.forFeature([
      { name: Neighbourhood.name, schema: NeighbourhoodSchema },
      { name: Circle.name,        schema: CircleSchema        },
      { name: Student.name,       schema: StudentSchema       },
      { name: Attendance.name,    schema: AttendanceSchema    },
      { name: Parent.name,        schema: ParentSchema        },
    ]),
  ],
  controllers: [AdminController],
  providers  : [AdminService],
})
export class AdminModule {}
