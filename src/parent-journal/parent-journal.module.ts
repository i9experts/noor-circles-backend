import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/user.schema';
import {
  Course, CourseAssignment, CourseAssignmentSchema, CourseLesson, CourseLessonSchema, CourseSchema,
  LessonProgress, LessonProgressSchema, MurabbiPoint, MurabbiPointSchema,
} from '../course/course.schema';
import { ParentJournalEntry, ParentJournalEntrySchema, ParentJournalMoment, ParentJournalMomentSchema } from './parent-journal.schema';
import { ParentJournalService } from './parent-journal.service';
import { ParentJournalController } from './parent-journal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ParentJournalEntry.name,  schema: ParentJournalEntrySchema  },
      { name: ParentJournalMoment.name, schema: ParentJournalMomentSchema },
      { name: Course.name,              schema: CourseSchema              },
      { name: CourseLesson.name,        schema: CourseLessonSchema        },
      { name: CourseAssignment.name,    schema: CourseAssignmentSchema    },
      { name: LessonProgress.name,      schema: LessonProgressSchema      },
      { name: MurabbiPoint.name,        schema: MurabbiPointSchema        },
      { name: User.name,                schema: UserSchema                },
    ]),
  ],
  controllers: [ParentJournalController],
  providers  : [ParentJournalService],
  exports    : [ParentJournalService],
})
export class ParentJournalModule {}
