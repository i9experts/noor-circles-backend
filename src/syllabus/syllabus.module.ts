import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CalendarEvent, CalendarEventSchema, SessionCoverage, SessionCoverageSchema, StudentNote, StudentNoteSchema,
  SyllabusSession, SyllabusSessionSchema, SyllabusTrack, SyllabusTrackSchema,
} from './syllabus.schema';
import { Circle, CircleSchema } from '../circle/circle.schema';
import { Student, StudentSchema } from '../student/student.schema';
import { Parent, ParentSchema } from '../parent/parent.schema';
import { Attendance, AttendanceSchema } from '../attendance/attendance.schema';
import { Incentive, IncentiveSchema } from '../incentive/incentive.schema';
import { SyllabusService } from './syllabus.service';
import { FamilyService } from './family.service';
import { FamilyController, SyllabusController } from './syllabus.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SyllabusTrack.name,   schema: SyllabusTrackSchema   },
      { name: SyllabusSession.name, schema: SyllabusSessionSchema },
      { name: SessionCoverage.name, schema: SessionCoverageSchema },
      { name: StudentNote.name,     schema: StudentNoteSchema     },
      { name: CalendarEvent.name,   schema: CalendarEventSchema   },
      { name: Circle.name,          schema: CircleSchema          },
      { name: Student.name,         schema: StudentSchema         },
      { name: Parent.name,          schema: ParentSchema          },
      { name: Attendance.name,      schema: AttendanceSchema      },
      { name: Incentive.name,       schema: IncentiveSchema       },
    ]),
  ],
  controllers: [SyllabusController, FamilyController],
  providers  : [SyllabusService, FamilyService],
  exports    : [SyllabusService, FamilyService, MongooseModule],
})
export class SyllabusModule {}
