import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PerformanceController } from './performance.controller';
import { PerformanceService }    from './performance.service';
import { Performance, PerformanceSchema } from './performance.schema';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Performance.name, schema: PerformanceSchema },
    ]),
    NotificationModule,
  ],
  controllers: [PerformanceController],
  providers  : [PerformanceService],
})
export class PerformanceModule {}
