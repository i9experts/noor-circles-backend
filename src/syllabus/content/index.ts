import { AgeGroup } from '../syllabus.schema';
import { SeedSession } from './types';
import { S01 } from './little-lights/s01';
import { S02_10 } from './little-lights/s02-10';
import { S11_20 } from './little-lights/s11-20';
import { S21_30 } from './little-lights/s21-30';
import { S31_40 } from './little-lights/s31-40';

export type { SeedSession } from './types';

/** The written Noor Circles sessions, by age group (Urdu). Other tracks are still to be written. */
export const WRITTEN_CONTENT: Partial<Record<AgeGroup, SeedSession[]>> = {
  '6-8': [...S01, ...S02_10, ...S11_20, ...S21_30, ...S31_40],
};
