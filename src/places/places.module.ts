import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Neighbourhood, NeighbourhoodSchema } from '../neighbourhood/neighbourhood.schema';
import { Interest, InterestSchema } from '../interest/interest.schema';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';

/** Global so the interest form and the dashboards can tidy place names without extra imports. */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Neighbourhood.name, schema: NeighbourhoodSchema },
      { name: Interest.name,      schema: InterestSchema      },
    ]),
  ],
  controllers: [PlacesController],
  providers  : [PlacesService],
  exports    : [PlacesService],
})
export class PlacesModule {}
