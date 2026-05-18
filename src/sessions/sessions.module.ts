import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionsController } from './sessions.controller';
import { SessionsService }    from './sessions.service';
import { Attendance, AttendanceSchema } from '../attendance/attendance.schema';
import { Circle, CircleSchema }         from '../circle/circle.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Attendance.name, schema: AttendanceSchema },
      { name: Circle.name,     schema: CircleSchema     },
    ]),
  ],
  controllers: [SessionsController],
  providers  : [SessionsService],
})
export class SessionsModule {}
