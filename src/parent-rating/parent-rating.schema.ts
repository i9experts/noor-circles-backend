import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model, Types } from 'mongoose';

export interface ParentRatingComponent {
  key   : 'attendance' | 'training' | 'targets' | 'reflections' | 'engagement';
  label : string;
  weight: number;           // nominal weight (sums to 100)
  score : number | null;    // 0–100, null = nothing to measure this month
  detail: string;
}

export type ParentRatingDocument = ParentRating & Document;

/** A parent's monthly rating (PKT), like the murabbi engagement rating. Seen by admins and the parent only. */
@Schema({ timestamps: true })
export class ParentRating {
  /** The parent's portal account. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user: Types.ObjectId;
  @Prop({ required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ }) month: string;
  @Prop({ type: [Object], default: [] }) components: ParentRatingComponent[];
  @Prop({ type: Number, default: 0 }) autoScore: number;
  /** Admin adjustment, −20…+20. */
  @Prop({ type: Number, default: 0, min: -20, max: 20 }) adjustment: number;
  @Prop({ trim: true, maxlength: 500, default: '' }) adjustmentNote: string;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) adjustedBy: Types.ObjectId | null;
  @Prop({ type: Number, default: 0 }) finalScore: number;
  @Prop({ type: Date, default: Date.now }) computedAt: Date;
}
export const ParentRatingSchema = SchemaFactory.createForClass(ParentRating);
ParentRatingSchema.index({ user: 1, month: 1 }, { unique: true });
ParentRatingSchema.index({ month: 1, finalScore: -1 });

export type ParentActivityDocument = ParentActivity & Document;

/** The days a family was active (family page or portal opened): one row per family per day. */
@Schema({ timestamps: false })
export class ParentActivity {
  @Prop({ type: Types.ObjectId, ref: 'Parent', required: true }) parent: Types.ObjectId;
  /** 'YYYY-MM-DD', Pakistan time. */
  @Prop({ type: String, required: true }) date: string;
  @Prop({ type: [String], default: [] }) kinds: string[];
}
export const ParentActivitySchema = SchemaFactory.createForClass(ParentActivity);
ParentActivitySchema.index({ parent: 1, date: 1 }, { unique: true });

/** Notes that a family was active today (never throws: it must not get in the way of the page). */
export function logParentActivity(model: Model<ParentActivityDocument>, parentId: Types.ObjectId | string, kind: 'family-page' | 'portal' | 'training') {
  const date = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  model.updateOne({ parent: new Types.ObjectId(String(parentId)), date }, { $addToSet: { kinds: kind } }, { upsert: true }).catch(() => {});
}
