import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TrainingController } from './training.controller';
import { TrainingService }    from './training.service';
import {
  TrainingModule as TrainingModuleEntity, TrainingModuleSchema,
  TrainingProgress, TrainingProgressSchema,
  TrainingBatch, TrainingBatchSchema,
} from './training.schema';
import { User, UserSchema } from '../user/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrainingModuleEntity.name, schema: TrainingModuleSchema   },
      { name: TrainingProgress.name,     schema: TrainingProgressSchema },
      { name: TrainingBatch.name,        schema: TrainingBatchSchema    },
      { name: User.name,                 schema: UserSchema             },
    ]),
  ],
  controllers: [TrainingController],
  providers  : [TrainingService],
})
export class TrainingNestModule {}
