import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module';
import { User, UserSchema } from '../user/user.schema';
import { Parent, ParentSchema } from '../parent/parent.schema';
import { Student, StudentSchema } from '../student/student.schema';
import { Circle, CircleSchema } from '../circle/circle.schema';
import { Interest, InterestSchema } from '../interest/interest.schema';
import { Cluster, ClusterSchema } from '../cluster/cluster.schema';
import {
  Course, CourseAssignment, CourseAssignmentSchema, CourseSchema, LessonProgress, LessonProgressSchema,
} from '../course/course.schema';
import {
  EmailCampaign, EmailCampaignSchema, EmailLog, EmailLogSchema, EmailPreference, EmailPreferenceSchema,
} from './email.schema';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';

/** Global so any feature can queue an email without importing this module. */
@Global()
@Module({
  imports: [
    MailModule,
    MongooseModule.forFeature([
      { name: EmailLog.name,         schema: EmailLogSchema         },
      { name: EmailPreference.name,  schema: EmailPreferenceSchema  },
      { name: EmailCampaign.name,    schema: EmailCampaignSchema    },
      { name: User.name,             schema: UserSchema             },
      { name: Parent.name,           schema: ParentSchema           },
      { name: Student.name,          schema: StudentSchema          },
      { name: Circle.name,           schema: CircleSchema           },
      { name: Course.name,           schema: CourseSchema           },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: LessonProgress.name,   schema: LessonProgressSchema   },
      { name: Interest.name,         schema: InterestSchema         },
      { name: Cluster.name,          schema: ClusterSchema          },
    ]),
  ],
  controllers: [EmailController],
  providers  : [EmailService],
  exports    : [EmailService],
})
export class EmailModule {}
