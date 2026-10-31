import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService }    from './admin.service';
import { UsersModule }          from '../user/user.module';
import { NotificationModule }   from '../notification/notification.module';
import { AnnouncementModule }   from '../announcement/announcement.module';
import { Neighbourhood, NeighbourhoodSchema, NeighbourhoodPipeline, NeighbourhoodPipelineSchema } from '../neighbourhood/neighbourhood.schema';
import { Circle, CircleSchema }               from '../circle/circle.schema';
import { Student, StudentSchema }             from '../student/student.schema';
import { Attendance, AttendanceSchema }       from '../attendance/attendance.schema';
import { Parent, ParentSchema }               from '../parent/parent.schema';
import { Incentive, IncentiveSchema }         from '../incentive/incentive.schema';
import { SyllabusTrack, SyllabusTrackSchema } from '../syllabus/syllabus.schema';
import { Performance, PerformanceSchema }     from '../performance/performance.schema';

import { Course, CourseAssignment, CourseAssignmentSchema, CourseSchema } from '../course/course.schema';

@Module({
  imports: [
    UsersModule,
    NotificationModule,
    AnnouncementModule,
    MongooseModule.forFeature([
      { name: Neighbourhood.name,         schema: NeighbourhoodSchema         },
      { name: NeighbourhoodPipeline.name, schema: NeighbourhoodPipelineSchema },
      { name: Circle.name,        schema: CircleSchema        },
      { name: Student.name,       schema: StudentSchema       },
      { name: Attendance.name,    schema: AttendanceSchema    },
      { name: Parent.name,        schema: ParentSchema        },
      { name: Incentive.name,     schema: IncentiveSchema     },
      { name: SyllabusTrack.name, schema: SyllabusTrackSchema },
      { name: Performance.name,   schema: PerformanceSchema   },
      { name: Course.name,           schema: CourseSchema           },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
    ]),
  ],
  controllers: [AdminController],
  providers  : [AdminService],
  exports    : [AdminService],
})
export class AdminModule {}
