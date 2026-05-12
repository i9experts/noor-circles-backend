import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TrainingController } from './training.controller';
import { TrainingService }    from './training.service';
import { TrainingModule as TrainingModuleEntity, TrainingModuleSchema } from './training.schema';
import { TrainingProgress, TrainingProgressSchema } from './training.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrainingModuleEntity.name, schema: TrainingModuleSchema  },
      { name: TrainingProgress.name,     schema: TrainingProgressSchema },
    ]),
  ],
  controllers: [TrainingController],
  providers  : [TrainingService],
})
export class TrainingNestModule {}
