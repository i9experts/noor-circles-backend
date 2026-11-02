import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/user.schema';
import { Circle, CircleSchema } from '../circle/circle.schema';
import {
  Course, CourseAssignment, CourseAssignmentSchema, CourseLesson, CourseLessonSchema, CourseReflection, CourseReflectionSchema,
  CourseSchema, LessonProgress, LessonProgressSchema, MurabbiPoint, MurabbiPointSchema,
} from '../course/course.schema';
import { JournalEntry, JournalEntrySchema, JournalMoment, JournalMomentSchema } from './journal.schema';
import { JournalService } from './journal.service';
import { JournalController } from './journal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JournalEntry.name,     schema: JournalEntrySchema     },
      { name: JournalMoment.name,    schema: JournalMomentSchema    },
      { name: Course.name,           schema: CourseSchema           },
      { name: CourseLesson.name,     schema: CourseLessonSchema     },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: LessonProgress.name,   schema: LessonProgressSchema   },
      { name: CourseReflection.name, schema: CourseReflectionSchema },
      { name: MurabbiPoint.name,     schema: MurabbiPointSchema     },
      { name: User.name,             schema: UserSchema             },
      { name: Circle.name,           schema: CircleSchema           },
    ]),
  ],
  controllers: [JournalController],
  providers  : [JournalService],
})
export class JournalModule {}
