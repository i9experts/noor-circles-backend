import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Course, CourseAssignment, CourseAssignmentSchema, CourseLesson, CourseLessonSchema, CourseSchema, CourseSection,
  CourseSectionSchema, FlipChartView, FlipChartViewSchema, LessonProgress, LessonProgressSchema, MurabbiPoint, MurabbiPointSchema,
} from '../course/course.schema';
import { User, UserSchema } from '../user/user.schema';
import { Parent, ParentSchema } from '../parent/parent.schema';
import { ParentActivity, ParentActivitySchema } from '../parent-rating/parent-rating.schema';
import { CourseModule } from '../course/course.module';
import {
  ParentQuizAttempt, ParentQuizAttemptSchema, ParentSelfCheck, ParentSelfCheckSchema, ParentTarget, ParentTargetSchema,
} from './parent-course.schema';
import { ParentCourseService } from './parent-course.service';
import { ParentCourseController } from './parent-course.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name,            schema: CourseSchema            },
      { name: CourseSection.name,     schema: CourseSectionSchema     },
      { name: CourseLesson.name,      schema: CourseLessonSchema      },
      { name: CourseAssignment.name,  schema: CourseAssignmentSchema  },
      { name: LessonProgress.name,    schema: LessonProgressSchema    },
      { name: FlipChartView.name,     schema: FlipChartViewSchema     },
      { name: MurabbiPoint.name,      schema: MurabbiPointSchema      },
      { name: ParentQuizAttempt.name, schema: ParentQuizAttemptSchema },
      { name: ParentSelfCheck.name,   schema: ParentSelfCheckSchema   },
      { name: ParentTarget.name,      schema: ParentTargetSchema      },
      { name: User.name,              schema: UserSchema              },
      { name: Parent.name,            schema: ParentSchema            },
      { name: ParentActivity.name,    schema: ParentActivitySchema    },
    ]),
    CourseModule,
  ],
  controllers: [ParentCourseController],
  providers  : [ParentCourseService],
  exports    : [ParentCourseService],
})
export class ParentCourseModule {}
