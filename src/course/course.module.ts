import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Course, CourseAssignment, CourseAssignmentSchema, CourseAttempt, CourseAttemptSchema, CourseLesson, CourseLessonSchema,
  CoursePractical, CoursePracticalSchema, CourseReflection, CourseReflectionSchema, CourseSchema, CourseSection,
  CourseSectionSchema, LessonProgress, LessonProgressSchema, MurabbiPoint, MurabbiPointSchema,
} from './course.schema';
import { User, UserSchema } from '../user/user.schema';
import { TrainingNestModule } from '../training/training.module';
import { NotificationModule } from '../notification/notification.module';
import { CourseService } from './course.service';
import { AudioStoreService } from './audio-store.service';
import { CourseController } from './course.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name,           schema: CourseSchema           },
      { name: CourseSection.name,    schema: CourseSectionSchema    },
      { name: CourseLesson.name,     schema: CourseLessonSchema     },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: LessonProgress.name,   schema: LessonProgressSchema   },
      { name: CourseAttempt.name,    schema: CourseAttemptSchema    },
      { name: CourseReflection.name, schema: CourseReflectionSchema },
      { name: CoursePractical.name,  schema: CoursePracticalSchema  },
      { name: MurabbiPoint.name,     schema: MurabbiPointSchema     },
      { name: User.name,             schema: UserSchema             },
    ]),
    TrainingNestModule,
    NotificationModule,
  ],
  controllers: [CourseController],
  providers  : [CourseService, AudioStoreService],
  exports    : [CourseService],
})
export class CourseModule {}
