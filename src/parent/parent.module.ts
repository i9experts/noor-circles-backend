import { Module } from '@nestjs/common';
import { SyllabusModule } from '../syllabus/syllabus.module';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ParentController } from './parent.controller';
import { ParentService }    from './parent.service';
import { Parent, ParentSchema }                           from './parent.schema';
import { Student, StudentSchema }                         from '../student/student.schema';
import { EngagementConfig, EngagementConfigSchema }       from './engagement.schema';
import { User, UserSchema }                               from '../user/user.schema';

@Module({
  imports: [
    JwtModule.register({}),
    SyllabusModule,
    MongooseModule.forFeature([
      { name: Parent.name,           schema: ParentSchema           },
      { name: Student.name,          schema: StudentSchema          },
      { name: EngagementConfig.name, schema: EngagementConfigSchema },
      { name: User.name,             schema: UserSchema             },
    ]),
  ],
  controllers: [ParentController],
  providers  : [ParentService],
  exports    : [MongooseModule],
})
export class ParentModule {}
