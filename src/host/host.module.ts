import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/user.schema';
import { Circle, CircleSchema } from '../circle/circle.schema';
import { Cluster, ClusterSchema } from '../cluster/cluster.schema';
import { Neighbourhood, NeighbourhoodSchema } from '../neighbourhood/neighbourhood.schema';
import { AudioStoreService } from '../course/audio-store.service';
import {
  HostModuleAudio, HostModuleAudioSchema, HostSpace, HostSpaceSchema, HostTraining, HostTrainingSchema,
  SpaceUnavailability, SpaceUnavailabilitySchema,
} from './host.schema';
import { HostService } from './host.service';
import { HostController } from './host.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HostSpace.name,           schema: HostSpaceSchema           },
      { name: SpaceUnavailability.name, schema: SpaceUnavailabilitySchema },
      { name: HostTraining.name,        schema: HostTrainingSchema        },
      { name: HostModuleAudio.name,     schema: HostModuleAudioSchema     },
      { name: User.name,                schema: UserSchema                },
      { name: Circle.name,              schema: CircleSchema              },
      { name: Cluster.name,             schema: ClusterSchema             },
      { name: Neighbourhood.name,       schema: NeighbourhoodSchema       },
    ]),
  ],
  controllers: [HostController],
  providers  : [HostService, AudioStoreService],
  exports    : [HostService],
})
export class HostModule {}
