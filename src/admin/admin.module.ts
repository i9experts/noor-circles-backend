import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService }    from './admin.service';
import { UsersModule }     from '../user/user.module';
import { Neighbourhood, NeighbourhoodSchema } from '../neighbourhood/neighbourhood.schema';
import { Circle, CircleSchema }               from '../circle/circle.schema';
import { Student, StudentSchema }             from '../student/student.schema';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Neighbourhood.name, schema: NeighbourhoodSchema },
      { name: Circle.name,        schema: CircleSchema        },
      { name: Student.name,       schema: StudentSchema       },
    ]),
  ],
  controllers: [AdminController],
  providers  : [AdminService],
})
export class AdminModule {}
