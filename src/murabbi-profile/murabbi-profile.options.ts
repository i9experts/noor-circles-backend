import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf, ValidateNested,
} from 'class-validator';

// The murabbi's introduction (based on the "Your Introduction" sheet):
// personal details, vision, education, experience, skills, affiliation and
// self-analysis. Admin-only: never shown to supervisors or other murabbis.
// Every answer is optional.

export const LEVELS = ['basic', 'good', 'very-good', 'expert'] as const;
export const QURAN = ['hafiz', 'nazira', 'learning', 'other'] as const;
export const LANGUAGES = ['urdu', 'english', 'arabic', 'punjabi', 'sindhi', 'pashto', 'balochi', 'saraiki', 'other'] as const;
export const SOFT_SKILLS = ['punctuality', 'decisionMaking', 'leadership', 'creativity', 'teamwork'] as const;
export const HARD_SKILLS = ['strategy', 'computer', 'graphicDesign', 'typing', 'administration', 'writing'] as const;
export type SkillKey = (typeof SOFT_SKILLS)[number] | (typeof HARD_SKILLS)[number];

const TEXT = 1000;
const LONG = 3000;

export class SkillDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(LEVELS)
  level?: string | null;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class ExperienceDto {
  @IsOptional() @IsString() @MaxLength(150) organisation?: string;
  @IsOptional() @IsString() @MaxLength(80)  duration?: string;
  @IsOptional() @IsString() @MaxLength(TEXT) responsibilities?: string;
}

class SkillsDto {
  @IsOptional() @ValidateNested() @Type(() => SkillDto) punctuality?: SkillDto;
  @IsOptional() @ValidateNested() @Type(() => SkillDto) decisionMaking?: SkillDto;
  @IsOptional() @ValidateNested() @Type(() => SkillDto) leadership?: SkillDto;
  @IsOptional() @ValidateNested() @Type(() => SkillDto) creativity?: SkillDto;
  @IsOptional() @ValidateNested() @Type(() => SkillDto) teamwork?: SkillDto;
  @IsOptional() @ValidateNested() @Type(() => SkillDto) strategy?: SkillDto;
  @IsOptional() @ValidateNested() @Type(() => SkillDto) computer?: SkillDto;
  @IsOptional() @ValidateNested() @Type(() => SkillDto) graphicDesign?: SkillDto;
  @IsOptional() @ValidateNested() @Type(() => SkillDto) typing?: SkillDto;
  @IsOptional() @ValidateNested() @Type(() => SkillDto) administration?: SkillDto;
  @IsOptional() @ValidateNested() @Type(() => SkillDto) writing?: SkillDto;
}

export class MurabbiProfileDto {
  // Personal information
  @IsOptional() @IsString() @MaxLength(100) fullName?: string;
  @IsOptional() @IsString() @MaxLength(100) fatherName?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date of birth must be YYYY-MM-DD.' }) dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(100) placeOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(30)  whatsapp?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;

  // Personal vision
  @IsOptional() @IsString() @MaxLength(TEXT) purpose?: string;
  @IsOptional() @IsString() @MaxLength(TEXT) approach?: string;
  @IsOptional() @IsString() @MaxLength(LONG) currentWork?: string;
  @IsOptional() @IsString() @MaxLength(TEXT) socialImpact?: string;

  // Education
  @IsOptional() @ValidateIf((_o, v) => v !== null && v !== '') @IsIn(QURAN) quran?: string | null;
  @IsOptional() @IsString() @MaxLength(300)  quranNote?: string;
  @IsOptional() @IsString() @MaxLength(TEXT) school?: string;
  @IsOptional() @IsString() @MaxLength(TEXT) college?: string;
  @IsOptional() @IsString() @MaxLength(TEXT) courses?: string;
  @IsOptional() @IsString() @MaxLength(TEXT) specialisation?: string;

  // Experience
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ExperienceDto)
  experience?: ExperienceDto[];

  // Skills
  @IsOptional() @IsArray() @ArrayMaxSize(LANGUAGES.length) @IsIn(LANGUAGES, { each: true })
  languages?: string[];
  @IsOptional() @IsString() @MaxLength(300) languagesNote?: string;
  @IsOptional() @ValidateNested() @Type(() => SkillsDto)
  skills?: SkillsDto;

  // Religious affiliation (all optional)
  @IsOptional() @IsString() @MaxLength(TEXT) islahi?: string;
  @IsOptional() @IsString() @MaxLength(TEXT) tabligh?: string;
  @IsOptional() @IsString() @MaxLength(TEXT) political?: string;

  // Self-analysis
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(300, { each: true })
  strengths?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(300, { each: true })
  weaknesses?: string[];
}

const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** The saved form: trimmed, empty rows dropped, unknown keys ignored. */
export function cleanIntroduction(dto: MurabbiProfileDto) {
  const skills: Record<string, { level: string | null; note: string }> = {};
  for (const k of [...SOFT_SKILLS, ...HARD_SKILLS]) {
    const s = dto.skills?.[k];
    if (s && (s.level || trim(s.note))) skills[k] = { level: s.level ?? null, note: trim(s.note) };
  }
  const list = (a?: string[]) => (a ?? []).map(trim).filter(Boolean);
  return {
    fullName: trim(dto.fullName), fatherName: trim(dto.fatherName), dateOfBirth: trim(dto.dateOfBirth), placeOfBirth: trim(dto.placeOfBirth),
    address: trim(dto.address), whatsapp: trim(dto.whatsapp), email: trim(dto.email),
    purpose: trim(dto.purpose), approach: trim(dto.approach), currentWork: trim(dto.currentWork), socialImpact: trim(dto.socialImpact),
    quran: dto.quran || null, quranNote: trim(dto.quranNote), school: trim(dto.school), college: trim(dto.college),
    courses: trim(dto.courses), specialisation: trim(dto.specialisation),
    experience: (dto.experience ?? [])
      .map((e) => ({ organisation: trim(e.organisation), duration: trim(e.duration), responsibilities: trim(e.responsibilities) }))
      .filter((e) => e.organisation || e.duration || e.responsibilities),
    languages: [...new Set(dto.languages ?? [])], languagesNote: trim(dto.languagesNote), skills,
    islahi: trim(dto.islahi), tabligh: trim(dto.tabligh), political: trim(dto.political),
    strengths: list(dto.strengths), weaknesses: list(dto.weaknesses),
  };
}

export type Introduction = ReturnType<typeof cleanIntroduction>;

/** Sections the form counts for "how complete is it" (shown to the murabbi and admins). */
export function completeness(p: Partial<Introduction> | null) {
  if (!p) return 0;
  const parts = [
    !!(p.fatherName && p.dateOfBirth && p.address),
    !!(p.purpose || p.approach || p.currentWork),
    !!(p.quran || p.school || p.college),
    !!p.experience?.length,
    !!(p.languages?.length || SOFT_SKILLS.some((k) => p.skills?.[k]?.level)),
    HARD_SKILLS.some((k) => p.skills?.[k]?.level),
    !!(p.strengths?.length || p.weaknesses?.length),
  ];
  return Math.round((parts.filter(Boolean).length / parts.length) * 100);
}
