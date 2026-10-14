import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MurabbiRating, MurabbiRatingSchema } from './engagement.schema';
import { User, UserSchema } from '../user/user.schema';
import { Circle, CircleSchema } from '../circle/circle.schema';
import { Student, StudentSchema } from '../student/student.schema';
import { Attendance, AttendanceSchema } from '../attendance/attendance.schema';
import { Parent, ParentSchema } from '../parent/parent.schema';
import { Performance, PerformanceSchema } from '../performance/performance.schema';
import {
  TrainingModule, TrainingModuleSchema, TrainingProgress, TrainingProgressSchema,
} from '../training/training.schema';
import { EngagementService } from './engagement.service';
import { EngagementController } from './engagement.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MurabbiRating.name,    schema: MurabbiRatingSchema    },
      { name: User.name,             schema: UserSchema             },
      { name: Circle.name,           schema: CircleSchema           },
      { name: Student.name,          schema: StudentSchema          },
      { name: Attendance.name,       schema: AttendanceSchema       },
      { name: Parent.name,           schema: ParentSchema           },
      { name: Performance.name,      schema: PerformanceSchema      },
      { name: TrainingModule.name,   schema: TrainingModuleSchema   },
      { name: TrainingProgress.name, schema: TrainingProgressSchema },
    ]),
  ],
  controllers: [EngagementController],
  providers  : [EngagementService],
  exports    : [EngagementService],
})
export class EngagementModule {}
