import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CircleDocument = Circle & Document;

@Schema({ timestamps: true })
export class Circle {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Neighbourhood', required: true })
  neighbourhood: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  murabbi: Types.ObjectId;

  @Prop({ type: Number, min: 1, default: 30 })
  capacity: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  // ── Schedule & syllabus ─────────────────────────────────────────────────────

  /** Syllabus track the circle follows (by age group). */
  @Prop({ type: Types.ObjectId, ref: 'SyllabusTrack', default: null })
  track: Types.ObjectId | null;

  /** Weekly meeting day, 0 = Sunday … 6 = Saturday (Pakistan time). */
  @Prop({ type: Number, min: 0, max: 6, default: null })
  meetingDay: number | null;

  /** "HH:MM", 24-hour, Pakistan time. */
  @Prop({ type: String, default: null })
  meetingTime: string | null;

  /** First meeting, 'YYYY-MM-DD'; sets how far along the syllabus the circle should be. */
  @Prop({ type: String, default: null })
  startDate: string | null;
}

export const CircleSchema = SchemaFactory.createForClass(Circle);

CircleSchema.index({ neighbourhood: 1 });
CircleSchema.index({ murabbi: 1 });
CircleSchema.index({ isActive: 1 });
