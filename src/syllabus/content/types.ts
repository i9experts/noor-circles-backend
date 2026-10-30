import { SessionPartKey } from '../syllabus.schema';

/** One part of a written session: a short heading and what the murabbi does. */
export interface SeedPart {
  /** Max 150 characters. */
  title: string;
  /** Max 2000 characters. One step per line; "• " starts a bullet. */
  details: string;
}

/** A fully written weekly session, ready to load into a track. */
export interface SeedSession {
  number: number;
  month: number;
  /** Max 150 characters. */
  title: string;
  objectives: string[];
  parts: Record<SessionPartKey, SeedPart>;
  /** Shown to families. Max 1000 characters. */
  homeActivity: string;
}
