import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PerformanceController } from './performance.controller';
import { PerformanceService }    from './performance.service';
import { Performance, PerformanceSchema } from './performance.schema';
import { NotificationModule } from '../notification/notification.module';
import { Circle, CircleSchema } from '../circle/circle.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Performance.name, schema: PerformanceSchema },
      { name: Circle.name,      schema: CircleSchema      },
    ]),
    NotificationModule,
  ],
  controllers: [PerformanceController],
  providers  : [PerformanceService],
})
export class PerformanceModule {}
