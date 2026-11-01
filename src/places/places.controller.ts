import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PlacesService } from './places.service';

/** Public: the website's city and area pick-lists, and "Use my location". */
@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  /** GET /places — cities with their areas, every district, and whether "Use my location" works. */
  @Get()
  catalogue() { return this.places.catalogue(); }

  /** GET /places/reverse?lat=&lng= — the city and area at a point. */
  @Get('reverse')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reverse(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.places.reverse(Number(lat), Number(lng));
  }
}
