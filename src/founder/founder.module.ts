import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FounderProfile, FounderProfileSchema } from './founder.schema';
import { FounderService } from './founder.service';
import { FounderController } from './founder.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: FounderProfile.name, schema: FounderProfileSchema }])],
  controllers: [FounderController],
  providers  : [FounderService],
})
export class FounderModule {}
