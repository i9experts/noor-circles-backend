import { AgeGroup } from '../syllabus.schema';
import { SeedSession } from './types';
import * as LL from './little-lights';
import * as GL from './growing-lights';

export type { SeedSession } from './types';

/** The written Noor Circles sessions, by age group (Urdu). Other tracks are still to be written. */
export const WRITTEN_CONTENT: Partial<Record<AgeGroup, SeedSession[]>> = {
  '6-8' : LL.SESSIONS,
  '9-10': GL.SESSIONS,
};
