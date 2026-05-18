import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ParentController } from './parent.controller';
import { ParentService }    from './parent.service';
import { Parent, ParentSchema }   from './parent.schema';
import { Student, StudentSchema } from '../student/student.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Parent.name,  schema: ParentSchema  },
      { name: Student.name, schema: StudentSchema },
    ]),
  ],
  controllers: [ParentController],
  providers  : [ParentService],
  exports    : [MongooseModule],
})
export class ParentModule {}
