import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TrainingModuleDocument  = TrainingModule  & Document;
export type TrainingProgressDocument = TrainingProgress & Document;
export type TrainingBatchDocument   = TrainingBatch   & Document;

@Schema({ timestamps: true })
export class TrainingModule {
  @Prop({ required: true, trim: true, maxlength: 150 })
  title: string;

  @Prop({ trim: true, maxlength: 500, default: '' })
  description: string;

  @Prop({ type: String, enum: ['Video', 'PDF', 'Live', 'Mixed'], default: 'Mixed' })
  type: string;

  @Prop({ type: String, enum: ['Available', 'Upcoming', 'Locked'], default: 'Available' })
  status: string;

  @Prop({ type: Number, default: 0 })
  totalLessons: number;

  @Prop({ type: Number, default: 0 })
  durationMinutes: number;

  @Prop({ type: Number, default: 0 })
  order: number;

  /** Which day of the training (1 or 2) */
  @Prop({ type: Number, enum: [1, 2], default: 1 })
  daySlot: number;

  /** Display time, e.g. "9:20–10:30 AM" */
  @Prop({ type: String, default: '' })
  timeSlot: string;

  /** Minimum murabbi tier (1, 2, or 3) required to access this module. */
  @Prop({ type: Number, enum: [1, 2, 3], default: 1 })
  minTier: number;
}

export const TrainingModuleSchema = SchemaFactory.createForClass(TrainingModule);

// ── TrainingProgress ──────────────────────────────────────────────────────────

@Schema({ timestamps: true })
export class TrainingProgress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TrainingModule', required: true })
  module: Types.ObjectId;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  progressPercent: number;

  @Prop({ type: Boolean, default: false })
  completed: boolean;
}

export const TrainingProgressSchema = SchemaFactory.createForClass(TrainingProgress);
TrainingProgressSchema.index({ user: 1, module: 1 }, { unique: true });

// ── TrainingBatch ─────────────────────────────────────────────────────────────

@Schema({ timestamps: true })
export class TrainingBatch {
  @Prop({ type: Number, required: true })
  batchNumber: number;

  @Prop({ type: String, enum: ['upcoming', 'active', 'completed'], default: 'upcoming' })
  status: string;

  @Prop({ type: Date, default: null })
  day1Date: Date | null;

  @Prop({ type: Date, default: null })
  day2Date: Date | null;

  @Prop({ type: String, default: 'Foundation & Identity', trim: true })
  day1Title: string;

  @Prop({ type: String, default: 'Skill, Safety & The Year', trim: true })
  day2Title: string;

  @Prop({ type: String, default: '9:00 AM – 3:00 PM · Modules 1, 2 & 3 · 5 hours', trim: true })
  day1Meta: string;

  @Prop({ type: String, default: '8:45 AM – 3:00 PM · Modules 4, 5 & 6 · 5 hours', trim: true })
  day2Meta: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  candidates: Types.ObjectId[];
}

export const TrainingBatchSchema = SchemaFactory.createForClass(TrainingBatch);
TrainingBatchSchema.index({ batchNumber: 1 }, { unique: true });
TrainingBatchSchema.index({ status: 1 });
