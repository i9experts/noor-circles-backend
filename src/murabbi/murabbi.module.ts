import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MurabbiController } from './murabbi.controller';
import { MurabbiService }    from './murabbi.service';
import { UsersModule }          from '../user/user.module';
import { NotificationModule }   from '../notification/notification.module';
import { Circle, CircleSchema }   from '../circle/circle.schema';
import { Student, StudentSchema } from '../student/student.schema';

@Module({
  imports: [
    UsersModule,
    NotificationModule,
    MongooseModule.forFeature([
      { name: Circle.name,  schema: CircleSchema  },
      { name: Student.name, schema: StudentSchema },
    ]),
  ],
  controllers: [MurabbiController],
  providers  : [MurabbiService],
})
export class MurabbiModule {}
