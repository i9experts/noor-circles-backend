import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── The weekly circle format (same six parts as on the website) ──────────────

export const SESSION_PARTS = [
  { key: 'welcome',  label: 'Welcome & warm-up',       minutes: 20 },
  { key: 'quran',    label: 'Qur’an & recitation',     minutes: 25 },
  { key: 'tarbiyah', label: 'Tarbiyah core lesson',    minutes: 30 },
  { key: 'activity', label: 'Activity & reflection',   minutes: 35 },
  { key: 'dhikr',    label: 'Dhikr & du’a circle',     minutes: 20 },
  { key: 'closing',  label: 'Closing & weekly pledge', minutes: 20 },
] as const;
export type SessionPartKey = (typeof SESSION_PARTS)[number]['key'];
export const PART_KEYS = SESSION_PARTS.map((p) => p.key);

/** The 12 monthly themes of the Noor Circles year. */
export const THEMES = [
  'Identity', 'Honesty', 'Family', 'Gratitude', 'Courage', 'Friendship',
  'Patience', 'Generosity', 'Body', 'Knowledge', 'Community', 'Legacy',
] as const;

export const AGE_GROUPS = ['6-8', '9-10', '11-13'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

// ── Track: one syllabus per age group ────────────────────────────────────────

export type SyllabusTrackDocument = SyllabusTrack & Document;

@Schema({ timestamps: true })
export class SyllabusTrack {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ type: String, enum: AGE_GROUPS, required: true, unique: true })
  ageGroup: AgeGroup;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  description: string;
}
export const SyllabusTrackSchema = SchemaFactory.createForClass(SyllabusTrack);

// ── Session: one weekly session of a track ───────────────────────────────────

@Schema({ _id: false })
export class SessionPart {
  @Prop({ type: String, enum: PART_KEYS, required: true })
  key: SessionPartKey;

  @Prop({ trim: true, maxlength: 150, default: '' })
  title: string;

  @Prop({ trim: true, maxlength: 2000, default: '' })
  details: string;

  @Prop({ type: Number, min: 0, max: 240, default: 0 })
  minutes: number;
}
export const SessionPartSchema = SchemaFactory.createForClass(SessionPart);

export type SyllabusSessionDocument = SyllabusSession & Document;

@Schema({ timestamps: true })
export class SyllabusSession {
  @Prop({ type: Types.ObjectId, ref: 'SyllabusTrack', required: true })
  track: Types.ObjectId;

  /** 1-based order within the track. */
  @Prop({ type: Number, required: true, min: 1 })
  number: number;

  /** Month of the Noor year (1–12), which sets the theme. */
  @Prop({ type: Number, required: true, min: 1, max: 12 })
  month: number;

  @Prop({ required: true, trim: true, maxlength: 150 })
  title: string;

  @Prop({ type: [String], default: [] })
  objectives: string[];

  @Prop({ type: [SessionPartSchema], default: [] })
  parts: SessionPart[];

  /** Shown to families: something to do together at home this week. */
  @Prop({ trim: true, maxlength: 1000, default: '' })
  homeActivity: string;

  /** Optional link to a lesson plan in the lesson library. */
  @Prop({ type: Types.ObjectId, ref: 'Lesson', default: null })
  lesson: Types.ObjectId | null;
}
export const SyllabusSessionSchema = SchemaFactory.createForClass(SyllabusSession);
SyllabusSessionSchema.index({ track: 1, number: 1 }, { unique: true });

// ── Coverage: what a circle actually covered, recorded by the Murabbi ────────

@Schema({ _id: false })
export class PartCoverage {
  @Prop({ type: String, enum: PART_KEYS, required: true })
  key: SessionPartKey;

  @Prop({ type: Boolean, default: false })
  done: boolean;
}
export const PartCoverageSchema = SchemaFactory.createForClass(PartCoverage);

export type SessionCoverageDocument = SessionCoverage & Document;

@Schema({ timestamps: true })
export class SessionCoverage {
  @Prop({ type: Types.ObjectId, ref: 'Circle', required: true })
  circle: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SyllabusSession', required: true })
  session: Types.ObjectId;

  @Prop({ type: Number, required: true })
  number: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  murabbi: Types.ObjectId;

  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ type: [PartCoverageSchema], default: [] })
  parts: PartCoverage[];

  /** True when every part was covered (or the Murabbi marked it complete). */
  @Prop({ type: Boolean, default: false })
  completed: boolean;

  @Prop({ trim: true, maxlength: 2000, default: '' })
  notes: string;
}
export const SessionCoverageSchema = SchemaFactory.createForClass(SessionCoverage);
SessionCoverageSchema.index({ circle: 1, session: 1 }, { unique: true });

// ── Notes to families about one child ────────────────────────────────────────

export type StudentNoteDocument = StudentNote & Document;

@Schema({ timestamps: true })
export class StudentNote {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  student: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Circle', required: true })
  circle: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SyllabusSession', default: null })
  session: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 500 })
  note: string;
}
export const StudentNoteSchema = SchemaFactory.createForClass(StudentNote);
StudentNoteSchema.index({ student: 1, createdAt: -1 });

// ── Calendar: holidays, parent evenings and other events ─────────────────────

export const EVENT_TYPES = ['holiday', 'parent_evening', 'event'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type CalendarEventDocument = CalendarEvent & Document;

@Schema({ timestamps: true })
export class CalendarEvent {
  @Prop({ required: true, trim: true, maxlength: 150 })
  title: string;

  @Prop({ type: String, enum: EVENT_TYPES, default: 'event' })
  type: EventType;

  /** Calendar dates, 'YYYY-MM-DD' in Pakistan time. */
  @Prop({ type: String, required: true })
  startDate: string;

  @Prop({ type: String, required: true })
  endDate: string;

  /** Empty = every circle. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Circle' }], default: [] })
  circles: Types.ObjectId[];

  /** Circles don't meet on these days (e.g. Eid). */
  @Prop({ type: Boolean, default: false })
  cancelsSessions: boolean;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  notes: string;
}
export const CalendarEventSchema = SchemaFactory.createForClass(CalendarEvent);
CalendarEventSchema.index({ startDate: 1 });
