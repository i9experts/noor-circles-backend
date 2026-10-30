import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/user.schema';
import { Neighbourhood, NeighbourhoodSchema } from '../neighbourhood/neighbourhood.schema';
import { Circle, CircleSchema } from '../circle/circle.schema';
import { Student, StudentSchema } from '../student/student.schema';
import { Attendance, AttendanceSchema } from '../attendance/attendance.schema';
import { Parent, ParentSchema } from '../parent/parent.schema';
import { Interest, InterestSchema } from '../interest/interest.schema';
import { Course, CourseAssignment, CourseAssignmentSchema, CourseSchema } from '../course/course.schema';
import { CalendarEvent, CalendarEventSchema } from '../syllabus/syllabus.schema';
import { EmailCampaign, EmailCampaignSchema } from '../email/email.schema';
import { AdminModule } from '../admin/admin.module';
import { AccountModule } from '../account/account.module';
import { InterestModule } from '../interest/interest.module';
import { SyllabusModule } from '../syllabus/syllabus.module';
import { NotificationModule } from '../notification/notification.module';
import { Cluster, ClusterSchema, ClusterVisit, ClusterVisitSchema } from './cluster.schema';
import { ClusterService } from './cluster.service';
import { ClusterAdminController, SupervisorController } from './cluster.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cluster.name,          schema: ClusterSchema          },
      { name: ClusterVisit.name,     schema: ClusterVisitSchema     },
      { name: User.name,             schema: UserSchema             },
      { name: Neighbourhood.name,    schema: NeighbourhoodSchema    },
      { name: Circle.name,           schema: CircleSchema           },
      { name: Student.name,          schema: StudentSchema          },
      { name: Attendance.name,       schema: AttendanceSchema       },
      { name: Parent.name,           schema: ParentSchema           },
      { name: Interest.name,         schema: InterestSchema         },
      { name: Course.name,           schema: CourseSchema           },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: CalendarEvent.name,    schema: CalendarEventSchema    },
      { name: EmailCampaign.name,    schema: EmailCampaignSchema    },
    ]),
    AdminModule,
    AccountModule,
    InterestModule,
    SyllabusModule,
    NotificationModule,
  ],
  controllers: [ClusterAdminController, SupervisorController],
  providers  : [ClusterService],
})
export class ClusterModule {}
