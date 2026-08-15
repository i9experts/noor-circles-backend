import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttendanceController } from './attendance.controller';
import { AttendanceService }    from './attendance.service';
import { Attendance, AttendanceSchema } from './attendance.schema';
import { Circle, CircleSchema }   from '../circle/circle.schema';
import { Student, StudentSchema } from '../student/student.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Attendance.name, schema: AttendanceSchema },
      { name: Circle.name,     schema: CircleSchema },
      { name: Student.name,    schema: StudentSchema },
    ]),
  ],
  controllers: [AttendanceController],
  providers  : [AttendanceService],
  exports    : [AttendanceService],
})
export class AttendanceModule {}
