import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/user.schema';
import {
  Course, CourseAssignment, CourseAssignmentSchema, CourseLesson, CourseLessonSchema, CourseSchema,
} from '../course/course.schema';
import { CourseModule } from '../course/course.module';
import { NotificationModule } from '../notification/notification.module';
import { TrainingRequest, TrainingRequestSchema } from './marketplace.schema';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrainingRequest.name,  schema: TrainingRequestSchema  },
      { name: Course.name,           schema: CourseSchema           },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: CourseLesson.name,     schema: CourseLessonSchema     },
      { name: User.name,             schema: UserSchema             },
    ]),
    CourseModule,
    NotificationModule,
  ],
  controllers: [MarketplaceController],
  providers  : [MarketplaceService],
})
export class MarketplaceModule {}
