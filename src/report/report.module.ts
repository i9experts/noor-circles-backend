import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportController } from './report.controller';
import { ReportService }    from './report.service';
import { Attendance, AttendanceSchema } from '../attendance/attendance.schema';
import { Student, StudentSchema }       from '../student/student.schema';
import { Circle, CircleSchema }         from '../circle/circle.schema';
import { Incentive, IncentiveSchema }   from '../incentive/incentive.schema';
import { Parent, ParentSchema }         from '../parent/parent.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Attendance.name, schema: AttendanceSchema },
      { name: Student.name,    schema: StudentSchema    },
      { name: Circle.name,     schema: CircleSchema     },
      { name: Incentive.name,  schema: IncentiveSchema  },
      { name: Parent.name,     schema: ParentSchema     },
    ]),
  ],
  controllers: [ReportController],
  providers  : [ReportService],
})
export class ReportModule {}
