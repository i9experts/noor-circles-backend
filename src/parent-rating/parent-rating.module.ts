import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/user.schema';
import { Parent, ParentSchema } from '../parent/parent.schema';
import { Attendance, AttendanceSchema } from '../attendance/attendance.schema';
import {
  CourseAssignment, CourseAssignmentSchema, CourseLesson, CourseLessonSchema, CourseReflection, CourseReflectionSchema,
  CourseSection, CourseSectionSchema, LessonProgress, LessonProgressSchema,
} from '../course/course.schema';
import { ParentCourseModule } from '../parent-course/parent-course.module';
import { ParentActivity, ParentActivitySchema, ParentRating, ParentRatingSchema } from './parent-rating.schema';
import { ParentRatingService } from './parent-rating.service';
import { ParentRatingController } from './parent-rating.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ParentRating.name,     schema: ParentRatingSchema     },
      { name: ParentActivity.name,   schema: ParentActivitySchema   },
      { name: User.name,             schema: UserSchema             },
      { name: Parent.name,           schema: ParentSchema           },
      { name: Attendance.name,       schema: AttendanceSchema       },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: CourseSection.name,    schema: CourseSectionSchema    },
      { name: CourseLesson.name,     schema: CourseLessonSchema     },
      { name: LessonProgress.name,   schema: LessonProgressSchema   },
      { name: CourseReflection.name, schema: CourseReflectionSchema },
    ]),
    ParentCourseModule,
  ],
  controllers: [ParentRatingController],
  providers  : [ParentRatingService],
  exports    : [ParentRatingService],
})
export class ParentRatingModule {}
