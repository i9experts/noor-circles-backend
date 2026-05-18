import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnnouncementController } from './announcement.controller';
import { AnnouncementService }    from './announcement.service';
import { Announcement, AnnouncementSchema } from './announcement.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Announcement.name, schema: AnnouncementSchema },
    ]),
  ],
  controllers: [AnnouncementController],
  providers  : [AnnouncementService],
  exports    : [AnnouncementService],
})
export class AnnouncementModule {}
