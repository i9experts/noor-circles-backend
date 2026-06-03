import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IncentiveController } from './incentive.controller';
import { IncentiveService }    from './incentive.service';
import { Incentive, IncentiveSchema }       from './incentive.schema';
import { Student, StudentSchema }           from '../student/student.schema';
import { Attendance, AttendanceSchema }     from '../attendance/attendance.schema';
import { User, UserSchema }                 from '../user/user.schema';
import { Circle, CircleSchema }             from '../circle/circle.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Incentive.name,   schema: IncentiveSchema   },
      { name: Student.name,     schema: StudentSchema     },
      { name: Attendance.name,  schema: AttendanceSchema  },
      { name: User.name,        schema: UserSchema        },
      { name: Circle.name,      schema: CircleSchema      },
    ]),
  ],
  controllers: [IncentiveController],
  providers  : [IncentiveService],
})
export class IncentiveModule {}
