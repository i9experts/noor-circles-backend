import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Parent, ParentSchema } from '../parent/parent.schema';
import { Interest, InterestSchema } from '../interest/interest.schema';
import { Student, StudentSchema } from '../student/student.schema';
import { Circle, CircleSchema } from '../circle/circle.schema';
import { Neighbourhood, NeighbourhoodSchema } from '../neighbourhood/neighbourhood.schema';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Parent.name,        schema: ParentSchema        },
      { name: Interest.name,      schema: InterestSchema      },
      { name: Student.name,       schema: StudentSchema       },
      { name: Circle.name,        schema: CircleSchema        },
      { name: Neighbourhood.name, schema: NeighbourhoodSchema },
    ]),
  ],
  controllers: [InsightsController],
  providers  : [InsightsService],
  exports    : [InsightsService],
})
export class InsightsModule {}
