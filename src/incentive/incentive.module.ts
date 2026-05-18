import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IncentiveController } from './incentive.controller';
import { IncentiveService }    from './incentive.service';
import { Incentive, IncentiveSchema } from './incentive.schema';
import { Student, StudentSchema }     from '../student/student.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Incentive.name, schema: IncentiveSchema },
      { name: Student.name,   schema: StudentSchema   },
    ]),
  ],
  controllers: [IncentiveController],
  providers  : [IncentiveService],
})
export class IncentiveModule {}
