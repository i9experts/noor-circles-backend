import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ParentController } from './parent.controller';
import { ParentService }    from './parent.service';
import { Parent, ParentSchema }                           from './parent.schema';
import { Student, StudentSchema }                         from '../student/student.schema';
import { EngagementConfig, EngagementConfigSchema }       from './engagement.schema';

@Module({
  imports: [
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: Parent.name,           schema: ParentSchema           },
      { name: Student.name,          schema: StudentSchema          },
      { name: EngagementConfig.name, schema: EngagementConfigSchema },
    ]),
  ],
  controllers: [ParentController],
  providers  : [ParentService],
  exports    : [MongooseModule],
})
export class ParentModule {}
