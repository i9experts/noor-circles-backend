import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LiveSessionController } from './live-session.controller';
import { LiveSessionService }    from './live-session.service';
import { LiveSession, LiveSessionSchema } from './live-session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LiveSession.name, schema: LiveSessionSchema }]),
  ],
  controllers: [LiveSessionController],
  providers  : [LiveSessionService],
  exports    : [LiveSessionService],
})
export class LiveSessionModule {}