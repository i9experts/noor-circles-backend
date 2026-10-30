import { Type } from 'class-transformer';
import {
  ArrayMaxSize, Equals, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateIf, ValidateNested,
} from 'class-validator';

// The optional "about your family" questions parents answer on the website
// form, their family page, or with the team. Admin-only: never shown to
// murabbis. Every question is optional; sensitive ones offer "prefer-not".

export const PROFILE_OPTIONS = {
  relationship: ['mother', 'father', 'grandparent', 'other-relative', 'guardian'],
  livesWith: ['both-parents', 'mother-only', 'father-only', 'father-away', 'mother-away', 'grandparents-relatives', 'guardian', 'prefer-not'],
  household: ['nuclear', 'joint', 'prefer-not'],
  work: ['full-time', 'part-time', 'from-home', 'business', 'shift', 'away', 'homemaker', 'looking', 'student', 'retired', 'not-applicable', 'prefer-not'],
  days: ['weekdays', 'saturday', 'sunday'],
  times: ['after-school', 'evening', 'weekend-morning'],
  transport: ['walks', 'dropped-off', 'needs-lift', 'not-sure'],
  ageBand: ['6-8', '9-10', '11-13'],
  gender: ['boy', 'girl'],
  school: ['government', 'private', 'madrasa', 'homeschool', 'not-in-school'],
  quran: ['not-started', 'qaida', 'nazra', 'hifz', 'madrasa-tutor'],
  language: ['urdu', 'english', 'sindhi', 'punjabi', 'pashto', 'balochi', 'saraiki', 'other'],
  needs: ['learning', 'health'],
  involvement: ['parent-evenings', 'volunteering', 'hosting', 'contributing', 'child-only'],
  heardFrom: ['friend-family', 'masjid', 'school', 'whatsapp', 'social', 'other'],
  contactBy: ['whatsapp', 'call', 'email'],
  contactTime: ['morning', 'afternoon', 'evening'],
} as const;

const o = PROFILE_OPTIONS;
const opt = (list: readonly string[]) => IsIn(list as unknown as string[], { message: 'Choose one of the listed options.' });
const optEach = (list: readonly string[]) => IsIn(list as unknown as string[], { each: true, message: 'Choose one of the listed options.' });
/** Optional, and a blank answer ("") counts as skipped. */
const Skip = () => ValidateIf((_, v) => v !== undefined && v !== null && v !== '');

export class ProfileChildDto {
  @Skip() @opt(o.ageBand) ageBand?: string;
  @Skip() @opt(o.gender) gender?: string;
  @Skip() @opt(o.school) school?: string;
  @Skip() @opt(o.quran) quran?: string;
}

export class ProfileWorkDto {
  @Skip() @opt(o.work) self?: string;
  @Skip() @opt(o.work) other?: string;
}

export class FamilyProfileDto {
  @Skip() @opt(o.relationship) relationship?: string;
  @Skip() @opt(o.livesWith) livesWith?: string;
  @Skip() @opt(o.household) household?: string;
  @IsOptional() @ValidateNested() @Type(() => ProfileWorkDto) work?: ProfileWorkDto;
  @IsOptional() @IsArray() @ArrayMaxSize(3) @optEach(o.days) days?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(3) @optEach(o.times) times?: string[];
  @Skip() @opt(o.transport) transport?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => ProfileChildDto) children?: ProfileChildDto[];
  @Skip() @opt(o.language) language?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(2) @optEach(o.needs) needs?: string[];
  @IsOptional() @IsString() @MaxLength(500) needsNote?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @optEach(o.involvement) involvement?: string[];
  @Skip() @opt(o.heardFrom) heardFrom?: string;
  @Skip() @opt(o.contactBy) contactBy?: string;
  @Skip() @opt(o.contactTime) contactTime?: string;

  /** "Noor Circles may use these answers only to arrange my child's circle." */
  @Equals(true, { message: 'Please tick the box to let us use these answers.' })
  consent: boolean;
}

export type FamilyProfile = Omit<FamilyProfileDto, 'consent'> & { consent: boolean; updatedAt: Date; source: 'website' | 'family-page' | 'admin' };

/** Keeps only answered fields (drops empty strings and arrays). */
export function cleanProfile(dto: FamilyProfileDto, source: FamilyProfile['source']): FamilyProfile {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dto)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      const items = k === 'children' ? v.map((c) => Object.fromEntries(Object.entries(c).filter(([, x]) => x))).filter((c) => Object.keys(c).length) : [...new Set(v)];
      if (items.length) out[k] = items;
      continue;
    }
    if (k === 'work') {
      const w = Object.fromEntries(Object.entries(v as object).filter(([, x]) => x));
      if (Object.keys(w).length) out.work = w;
      continue;
    }
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return { ...(out as Omit<FamilyProfile, 'updatedAt' | 'source'>), consent: true, updatedAt: new Date(), source };
}
