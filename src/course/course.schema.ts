import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Course ───────────────────────────────────────────────────────────────────

@Schema({ _id: false })
export class CourseQuestion {
  @Prop({ required: true, trim: true, maxlength: 1000 })
  question: string;

  /** English rendering, for admins reviewing an Urdu question. */
  @Prop({ trim: true, maxlength: 1000, default: '' })
  questionEn: string;

  @Prop({ type: [String], required: true })
  options: string[];

  @Prop({ type: Number, required: true, min: 0 })
  correctIndex: number;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  explanation: string;

  /** Lesson code the answer comes from, e.g. "M1-05". */
  @Prop({ trim: true, maxlength: 20, default: '' })
  sourceLesson: string;

  @Prop({ trim: true, maxlength: 150, default: '' })
  module: string;
}
export const CourseQuestionSchema = SchemaFactory.createForClass(CourseQuestion);

@Schema({ _id: false })
export class CoursePoints {
  @Prop({ type: Number, default: 10 })  lesson: number;
  @Prop({ type: Number, default: 25 })  section: number;
  @Prop({ type: Number, default: 100 }) assessment: number;
}
export const CoursePointsSchema = SchemaFactory.createForClass(CoursePoints);

/** A flip chart the training audio refers to. Its drawing lives in the portal (by key). */
@Schema({ _id: false })
export class CourseFlipChart {
  @Prop({ required: true, trim: true })  key: string;          // "fc-01"
  @Prop({ type: Number, required: true }) number: number;
  @Prop({ trim: true, default: '' })     module: string;       // "Module 1"
  @Prop({ trim: true, default: '' })     title: string;        // Urdu
  @Prop({ trim: true, default: '' })     subtitle: string;     // English
  /** When the trainer uses it, e.g. prepared in advance or written live. */
  @Prop({ trim: true, default: '' })     when: string;
  @Prop({ type: Boolean, default: false }) live: boolean;
  /** Lessons whose audio explains this chart. */
  @Prop({ type: [String], default: [] }) lessonCodes: string[];
  /** Meant to be printed or copied (fridge, journal, wall). */
  @Prop({ type: Boolean, default: false }) printable: boolean;
}
export const CourseFlipChartSchema = SchemaFactory.createForClass(CourseFlipChart);

export type CourseDocument = Course & Document;

@Schema({ timestamps: true })
export class Course {
  @Prop({ required: true, unique: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true, default: '' })
  titleUr: string;

  /** Training tier this course certifies (its certificate is the tier certificate). Null for the parents' course. */
  @Prop({ type: Number, enum: [1, 2, 3, null], default: null })
  tier: number | null;

  /** Who takes it: murabbis (tier training) or parents (Asaas for Parents, admin-only progress). */
  @Prop({ type: String, enum: ['murabbi', 'parent'], default: 'murabbi' })
  audience: 'murabbi' | 'parent';

  @Prop({ trim: true, default: '' })
  trainer: string;

  /** Share of a lesson that must be heard for it to count as completed (0–1). */
  @Prop({ type: Number, min: 0.5, max: 1, default: 0.9 })
  completionThreshold: number;

  /** Lessons unlock one after another. */
  @Prop({ type: Boolean, default: true })
  sequential: boolean;

  @Prop({ type: Number, min: 0, max: 100, default: 70 })
  passingScore: number;

  @Prop({ type: Number, min: 1, max: 10, default: 3 })
  maxFailedAttemptsPerDay: number;

  /** If true, an admin-entered practical score is also needed for the certificate. */
  @Prop({ type: Boolean, default: false })
  requirePractical: boolean;

  @Prop({ trim: true, default: '' })
  reflectionPrompt: string;

  @Prop({ type: Number, min: 0, max: 5000, default: 300 })
  reflectionMinChars: number;

  @Prop({ type: [CourseQuestionSchema], default: [] })
  questions: CourseQuestion[];

  @Prop({ type: CoursePointsSchema, default: () => ({}) })
  points: CoursePoints;

  @Prop({ type: [CourseFlipChartSchema], default: [] })
  flipCharts: CourseFlipChart[];

  /** Title of the badge shown on the murabbi's account once certified. */
  @Prop({ trim: true, default: 'Certified Asaas Murabbi' })
  badge: string;
}
export const CourseSchema = SchemaFactory.createForClass(Course);

// ── Sections and lessons ─────────────────────────────────────────────────────

export type CourseSectionDocument = CourseSection & Document;

@Schema({ timestamps: true })
export class CourseSection {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course: Types.ObjectId;

  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ type: Number, required: true })
  order: number;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true, default: '' })
  titleUr: string;

  @Prop({ trim: true, default: '' })
  meta: string;

  /** Days after the course starts for this person when the section opens (0 = straight away). */
  @Prop({ type: Number, min: 0, default: 0 })
  unlockDay: number;
}
export const CourseSectionSchema = SchemaFactory.createForClass(CourseSection);
CourseSectionSchema.index({ course: 1, key: 1 }, { unique: true });

@Schema({ _id: false })
export class TranscriptPara {
  /** 'p' = Urdu prose, 'ar' = Arabic (Qur'an / du'a). */
  @Prop({ type: String, enum: ['p', 'ar'], default: 'p' }) k: string;
  @Prop({ type: String, default: '' }) t: string;
}
export const TranscriptParaSchema = SchemaFactory.createForClass(TranscriptPara);

@Schema({ _id: false })
export class LessonAudio {
  @Prop({ type: Types.ObjectId, default: null }) fileId: Types.ObjectId | null;
  @Prop({ type: Number, default: 0 })            size: number;
  @Prop({ type: Date, default: null })           uploadedAt: Date | null;
}
export const LessonAudioSchema = SchemaFactory.createForClass(LessonAudio);

export type CourseLessonDocument = CourseLesson & Document;

@Schema({ timestamps: true })
export class CourseLesson {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CourseSection', required: true })
  section: Types.ObjectId;

  /** Clip id, e.g. "M4-01"; the audio file is matched by it ("m4-01.mp3"). */
  @Prop({ required: true, trim: true })
  code: string;

  /** Position in the whole course (1-based). */
  @Prop({ type: Number, required: true })
  order: number;

  @Prop({ required: true, trim: true })
  title: string;

  /** Sub-heading within the module, e.g. "1.1 · تربیت کیا ہے؟". */
  @Prop({ trim: true, default: '' })
  topic: string;

  @Prop({ type: Number, required: true, min: 1 })
  durationSec: number;

  @Prop({ type: [TranscriptParaSchema], default: [] })
  transcript: TranscriptPara[];

  /** Production notes for trainers; never shown to murabbis. */
  @Prop({ type: [String], default: [] })
  trainerNotes: string[];

  @Prop({ type: LessonAudioSchema, default: () => ({}) })
  audio: LessonAudio;
}
export const CourseLessonSchema = SchemaFactory.createForClass(CourseLesson);
CourseLessonSchema.index({ course: 1, code: 1 }, { unique: true });
CourseLessonSchema.index({ course: 1, order: 1 });

// ── Assignment and listening progress ────────────────────────────────────────

export type CourseAssignmentDocument = CourseAssignment & Document;

@Schema({ timestamps: true })
export class CourseAssignment {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  assignedBy: Types.ObjectId;

  /** 'YYYY-MM-DD' or null. */
  @Prop({ type: String, default: null })
  dueDate: string | null;

  @Prop({ trim: true, maxlength: 500, default: '' })
  note: string;

  @Prop({ type: Date, default: null })
  certifiedAt: Date | null;

  /** Parents' course: every section open now, whatever the fortnight. */
  @Prop({ type: Boolean, default: false })
  allOpen: boolean;

  /** Parents' course certificate number, once earned. */
  @Prop({ type: String, default: null })
  certificateNumber: string | null;
}
export const CourseAssignmentSchema = SchemaFactory.createForClass(CourseAssignment);
CourseAssignmentSchema.index({ course: 1, user: 1 }, { unique: true });

export type LessonProgressDocument = LessonProgress & Document;

@Schema({ timestamps: true })
export class LessonProgress {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CourseLesson', required: true })
  lesson: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  /** Merged [start, end] second ranges actually played. */
  @Prop({ type: [[Number]], default: [] })
  heard: number[][];

  @Prop({ type: Number, default: 0 })
  heardSec: number;

  /** 0–100 */
  @Prop({ type: Number, default: 0 })
  percent: number;

  @Prop({ type: Boolean, default: false })
  completed: boolean;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  /** Where to resume. */
  @Prop({ type: Number, default: 0 })
  lastPosition: number;

  /** Total listening time, replays included. */
  @Prop({ type: Number, default: 0 })
  listenSec: number;

  @Prop({ type: Date, default: null })
  lastBeatAt: Date | null;
}
export const LessonProgressSchema = SchemaFactory.createForClass(LessonProgress);
LessonProgressSchema.index({ lesson: 1, user: 1 }, { unique: true });
LessonProgressSchema.index({ course: 1, user: 1 });

// ── Assessment ───────────────────────────────────────────────────────────────

export type CourseAttemptDocument = CourseAttempt & Document;

@Schema({ timestamps: true })
export class CourseAttempt {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })  course: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })    user: Types.ObjectId;
  @Prop({ type: [Number], default: [] })                          answers: number[];
  @Prop({ type: Number, required: true })                         correct: number;
  @Prop({ type: Number, required: true })                         total: number;
  @Prop({ type: Number, required: true })                         scorePercent: number;
  @Prop({ type: Boolean, required: true })                        passed: boolean;
}
export const CourseAttemptSchema = SchemaFactory.createForClass(CourseAttempt);
CourseAttemptSchema.index({ course: 1, user: 1, createdAt: -1 });

export const REFLECTION_STATUSES = ['submitted', 'approved', 'revision'] as const;

export type CourseReflectionDocument = CourseReflection & Document;

@Schema({ timestamps: true })
export class CourseReflection {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })  course: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })    user: Types.ObjectId;
  @Prop({ required: true, maxlength: 10000 })                     text: string;
  @Prop({ type: String, enum: REFLECTION_STATUSES, default: 'submitted' }) status: string;
  @Prop({ trim: true, maxlength: 2000, default: '' })             feedback: string;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })     reviewedBy: Types.ObjectId | null;
  @Prop({ type: Date, default: null })                            reviewedAt: Date | null;
  @Prop({ type: Date, default: Date.now })                        submittedAt: Date;
}
export const CourseReflectionSchema = SchemaFactory.createForClass(CourseReflection);
CourseReflectionSchema.index({ course: 1, user: 1 }, { unique: true });

/**
 * The six facilitation criteria from the training (FA-03), each scored 1–3.
 * Out of 18: 12+ pass, 8–11 conditional pass (certified, with one thing to
 * work on), under 8 one more practice session before certification.
 */
export const PRACTICAL_CRITERIA = [
  'Created a welcoming, safe environment',
  'Asked open or deepening questions',
  'Responded to the group with real attention',
  'Used the right ritual elements (opening and closing)',
  'Handled a difficult moment appropriately',
  'Language and tone suited to the children’s age',
] as const;
export const PRACTICAL_PASS = 12;
export const PRACTICAL_CONDITIONAL = 8;

export function practicalBand(total: number): 'pass' | 'conditional' | 'practice' {
  return total >= PRACTICAL_PASS ? 'pass' : total >= PRACTICAL_CONDITIONAL ? 'conditional' : 'practice';
}

export type CoursePracticalDocument = CoursePractical & Document;

@Schema({ timestamps: true })
export class CoursePractical {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })  course: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })    user: Types.ObjectId;
  @Prop({ type: [Number], required: true })                       scores: number[];
  @Prop({ type: Number, required: true })                         total: number;
  @Prop({ trim: true, maxlength: 2000, default: '' })             notes: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })    assessedBy: Types.ObjectId;
}
export const CoursePracticalSchema = SchemaFactory.createForClass(CoursePractical);
CoursePracticalSchema.index({ course: 1, user: 1 }, { unique: true });

// ── Murabbi points ───────────────────────────────────────────────────────────

export type MurabbiPointDocument = MurabbiPoint & Document;

/** Points a murabbi earns (training lessons, modules, assessment). One row per achievement. */
@Schema({ timestamps: true })
export class MurabbiPoint {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })   user: Types.ObjectId;
  @Prop({ type: Number, required: true })                        points: number;
  @Prop({ type: String, required: true })                        reason: string;
  /** What it was for (lesson / section / course id) — makes awards idempotent. */
  @Prop({ type: String, required: true })                        ref: string;
  @Prop({ trim: true, default: '' })                             label: string;
}
export const MurabbiPointSchema = SchemaFactory.createForClass(MurabbiPoint);
MurabbiPointSchema.index({ user: 1, reason: 1, ref: 1 }, { unique: true });

// ── Flip chart views ─────────────────────────────────────────────────────────

export type FlipChartViewDocument = FlipChartView & Document;

/** How long a murabbi has looked at each flip chart. Counts as studied at FLIP_CHART_STUDIED_SEC. */
@Schema({ timestamps: true })
export class FlipChartView {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true }) course: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })   user: Types.ObjectId;
  @Prop({ type: String, required: true })                        chart: string;
  @Prop({ type: Number, default: 0 })                            seconds: number;
  /** Separate openings (a report after a gap of 10+ minutes starts a new one). */
  @Prop({ type: Number, default: 0 })                            opens: number;
  @Prop({ type: Date, default: null })                           studiedAt: Date | null;
  @Prop({ type: Date, default: null })                           lastViewedAt: Date | null;
}
export const FlipChartViewSchema = SchemaFactory.createForClass(FlipChartView);
FlipChartViewSchema.index({ course: 1, user: 1, chart: 1 }, { unique: true });

export const FLIP_CHART_STUDIED_SEC = 20;
