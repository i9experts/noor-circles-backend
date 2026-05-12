import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportController } from './report.controller';
import { ReportService }    from './report.service';
import { Attendance, AttendanceSchema } from '../attendance/attendance.schema';
import { Student, StudentSchema } from '../student/student.schema';
import { Circle, CircleSchema }   from '../circle/circle.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Attendance.name, schema: AttendanceSchema },
      { name: Student.name,    schema: StudentSchema    },
      { name: Circle.name,     schema: CircleSchema     },
    ]),
  ],
  controllers: [ReportController],
  providers  : [ReportService],
})
export class ReportModule {}
