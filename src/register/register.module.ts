import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/user.schema';
import { Circle, CircleSchema } from '../circle/circle.schema';
import { Cluster, ClusterSchema } from '../cluster/cluster.schema';
import { Neighbourhood, NeighbourhoodSchema } from '../neighbourhood/neighbourhood.schema';
import { Student, StudentSchema } from '../student/student.schema';
import { Parent, ParentSchema } from '../parent/parent.schema';
import { Attendance, AttendanceSchema } from '../attendance/attendance.schema';
import { Interest, InterestSchema } from '../interest/interest.schema';
import { MurabbiRating, MurabbiRatingSchema } from '../engagement/engagement.schema';
import { ParentRating, ParentRatingSchema } from '../parent-rating/parent-rating.schema';
import { RewardAllocation, RewardAllocationSchema } from '../rewards/rewards.schema';
import { MurabbiProfile, MurabbiProfileSchema } from '../murabbi-profile/murabbi-profile.schema';
import { Course, CourseAssignment, CourseAssignmentSchema, CourseSchema } from '../course/course.schema';
import { TrainingCertificate, TrainingCertificateSchema } from '../training/training.schema';
import { HostSpace, HostSpaceSchema } from '../host/host.schema';
import { CourseModule } from '../course/course.module';
import { ParentCourseModule } from '../parent-course/parent-course.module';
import { JournalModule } from '../journal/journal.module';
import { HostModule } from '../host/host.module';
import { RegisterFollowUp, RegisterFollowUpSchema } from './register.schema';
import { RegisterService } from './register.service';
import { RegisterController } from './register.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RegisterFollowUp.name,    schema: RegisterFollowUpSchema    },
      { name: User.name,                schema: UserSchema                },
      { name: Circle.name,              schema: CircleSchema              },
      { name: Cluster.name,             schema: ClusterSchema             },
      { name: Neighbourhood.name,       schema: NeighbourhoodSchema       },
      { name: Student.name,             schema: StudentSchema             },
      { name: Parent.name,              schema: ParentSchema              },
      { name: Attendance.name,          schema: AttendanceSchema          },
      { name: Interest.name,            schema: InterestSchema            },
      { name: MurabbiRating.name,       schema: MurabbiRatingSchema       },
      { name: ParentRating.name,        schema: ParentRatingSchema        },
      { name: RewardAllocation.name,    schema: RewardAllocationSchema    },
      { name: MurabbiProfile.name,      schema: MurabbiProfileSchema      },
      { name: Course.name,              schema: CourseSchema              },
      { name: CourseAssignment.name,    schema: CourseAssignmentSchema    },
      { name: TrainingCertificate.name, schema: TrainingCertificateSchema },
      { name: HostSpace.name,           schema: HostSpaceSchema           },
    ]),
    CourseModule, ParentCourseModule, JournalModule, HostModule,
  ],
  controllers: [RegisterController],
  providers  : [RegisterService],
})
export class RegisterModule {}
