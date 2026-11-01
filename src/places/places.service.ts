import { BadRequestException, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Neighbourhood, NeighbourhoodDocument } from '../neighbourhood/neighbourhood.schema';
import { Interest, InterestDocument } from '../interest/interest.schema';
import { CITIES, DISTRICTS } from './pakistan-places';
import { NamedPlace, groupNames, matchPlace, placeKey, tidyName } from './places.util';

/** About 1 km: enough to suggest a nearby circle, not enough to find a home. */
const roundCoord = (n: number) => Math.round(n * 100) / 100;

interface GoogleComponent { long_name: string; types: string[] }

/**
 * One spelling for every city and area. Known places come from the list of
 * Pakistan's cities, towns and districts plus the programme's own
 * neighbourhoods; anything else is tidied, and look-alike spellings are
 * grouped, so "FAISALABAD", "Faisalabad" and "Faislabad" count once.
 */
@Injectable()
export class PlacesService implements OnModuleInit {
  private readonly logger = new Logger(PlacesService.name);
  private readonly mapsKey: string;

  constructor(
    config: ConfigService,
    @InjectModel(Neighbourhood.name) private readonly areaModel:     Model<NeighbourhoodDocument>,
    @InjectModel(Interest.name)      private readonly interestModel: Model<InterestDocument>,
  ) {
    this.mapsKey = (config.get<string>('GOOGLE_MAPS_API_KEY') ?? '').trim();
  }

  /** Existing interest requests get the tidy spellings once (the typed text is kept). */
  async onModuleInit() {
    try {
      const old = await this.interestModel.find({ cityRaw: { $exists: false } }).select('city neighbourhood').lean();
      if (!old.length) return;
      const lists = await this.lists();
      for (const r of old) {
        const city = this.cityIn(r.city, lists);
        await this.interestModel.updateOne({ _id: r._id }, { $set: {
          cityRaw: r.city, neighbourhoodRaw: r.neighbourhood, city, neighbourhood: this.areaIn(city, r.neighbourhood, lists),
        } });
      }
      this.logger.log(`Tidied the place names of ${old.length} interest request${old.length === 1 ? '' : 's'}.`);
    } catch (err) {
      this.logger.warn(`Could not tidy place names: ${(err as Error).message}`);
    }
  }

  // ══ Known places ═══════════════════════════════════════════════════════════

  private allCities(): NamedPlace[] {
    const districts = DISTRICTS.flatMap((p) => p.districts);
    // Districts named after a city (Lahore, Multan…) are the same place as the city.
    return [...CITIES, ...districts.filter((d) => !CITIES.some((c) => matchPlace(d.name, [c])))];
  }

  /** The known cities and each city's known areas (the programme's neighbourhoods included). */
  private async lists() {
    const cities = this.allCities();
    // The programme's own neighbourhoods come first, so their names win over the general list's spellings.
    const own = new Map<string, NamedPlace[]>();
    for (const n of await this.areaModel.find().select('name city').lean()) {
      const city = matchPlace(n.city ?? '', cities)?.name ?? tidyName(n.city ?? '');
      own.set(city, [...(own.get(city) ?? []), { name: n.name }]);
    }
    const areas = new Map<string, NamedPlace[]>();
    for (const city of new Set([...CITIES.map((c) => c.name), ...own.keys()])) {
      const mine = own.get(city) ?? [];
      const listed = (CITIES.find((c) => c.name === city)?.areas ?? []).filter((a) => !mine.some((m) => placeKey(m.name) === placeKey(a.name)));
      areas.set(city, [...mine, ...listed]);
    }
    return { cities, areas };
  }

  private cityIn(text: string, lists: { cities: NamedPlace[] }) {
    return matchPlace(text ?? '', lists.cities)?.name ?? tidyName(text ?? '');
  }

  private areaIn(city: string, text: string, lists: { areas: Map<string, NamedPlace[]> }) {
    return matchPlace(text ?? '', lists.areas.get(city) ?? [])?.name ?? tidyName(text ?? '');
  }

  /** The tidy city and area for something typed on a form. */
  async tidy(city: string, area: string) {
    const lists = await this.lists();
    const c = this.cityIn(city, lists);
    return { city: c, area: this.areaIn(c, area, lists) };
  }

  /**
   * Tidies a list of rows in place: known names first, then look-alike
   * spellings grouped among themselves (cities overall, areas within a city).
   */
  async tidyRows<T extends { city: string; neighbourhood: string }>(rows: T[]) {
    const lists = await this.lists();
    const cityMap = groupNames(rows.map((r) => r.city), lists.cities);
    for (const r of rows) r.city = cityMap.get(r.city) ?? r.city;
    const byCity = new Map<string, T[]>();
    for (const r of rows) byCity.set(r.city, [...(byCity.get(r.city) ?? []), r]);
    for (const [city, list] of byCity) {
      const areaMap = groupNames(list.map((r) => r.neighbourhood), lists.areas.get(city) ?? []);
      for (const r of list) r.neighbourhood = areaMap.get(r.neighbourhood) ?? r.neighbourhood;
    }
    return rows;
  }

  // ══ For the website form ═══════════════════════════════════════════════════

  /** The pick-lists: cities with their areas, and every district for "Other city". */
  async catalogue() {
    const { areas } = await this.lists();
    return {
      cities: CITIES.map((c) => ({
        name: c.name, province: c.province, district: c.district,
        areas: (areas.get(c.name) ?? []).map((a) => a.name).sort((a, b) => a.localeCompare(b)),
      })),
      districts: DISTRICTS.map((p) => ({ province: p.province, districts: p.districts.map((d) => d.name) })),
      locationEnabled: !!this.mapsKey,
    };
  }

  /** "Use my location": the city, area and district for a point (Google reverse geocoding). */
  async reverse(lat: number, lng: number) {
    if (!this.mapsKey) throw new ServiceUnavailableException('Finding your location isn’t available right now. Please choose your city and area.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new BadRequestException('Invalid location.');
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&region=pk&key=${encodeURIComponent(this.mapsKey)}`;
    let body: { status: string; results?: { address_components: GoogleComponent[] }[] };
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      body = await res.json();
    } catch (err) {
      this.logger.warn(`Reverse geocoding failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('We couldn’t look up your location. Please choose your city and area.');
    }
    if (body.status !== 'OK' || !body.results?.length) {
      if (body.status !== 'ZERO_RESULTS') this.logger.warn(`Reverse geocoding: ${body.status}`);
      throw new ServiceUnavailableException('We couldn’t find your area. Please choose your city and area.');
    }
    const results = body.results;
    const first = (...types: string[]) => {
      for (const t of types) for (const r of results) {
        const c = r.address_components.find((x) => x.types.includes(t));
        if (c) return c.long_name;
      }
      return '';
    };
    const lists = await this.lists();
    const cityText = first('locality', 'administrative_area_level_3', 'administrative_area_level_2');
    const city = this.cityIn(cityText, lists);
    const known = CITIES.some((c) => c.name === city);
    const areaText = first('sublocality_level_1', 'neighborhood', 'sublocality', 'sublocality_level_2');
    const district = matchPlace(first('administrative_area_level_2'), DISTRICTS.flatMap((p) => p.districts))?.name ?? tidyName(first('administrative_area_level_2'));
    const province = DISTRICTS.find((p) => p.districts.some((d) => d.name === district))?.province ?? tidyName(first('administrative_area_level_1'));
    return {
      city, cityListed: known, area: areaText ? this.areaIn(city, areaText, lists) : '',
      district, province, lat: roundCoord(lat), lng: roundCoord(lng),
    };
  }
}
