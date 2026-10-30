import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Interest, InterestSchema } from './interest.schema';
import { InterestService } from './interest.service';
import { InterestController } from './interest.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Interest.name, schema: InterestSchema }]),
    NotificationModule,
  ],
  controllers: [InterestController],
  providers  : [InterestService],
  exports    : [InterestService],
})
export class InterestModule {}
