import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MurabbiRatingDocument = MurabbiRating & Document;

export interface RatingComponent {
  key   : 'sessions' | 'attendance' | 'reviews' | 'feedback' | 'training';
  label : string;
  weight: number;           // nominal weight (sums to 100)
  score : number | null;    // 0–100, null = no data this month
  detail: string;           // human-readable basis, e.g. "7 of 8 sessions"
}

/** A murabbi's engagement rating for one month (PKT). */
@Schema({ timestamps: true })
export class MurabbiRating {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  murabbi: Types.ObjectId;

  @Prop({ required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ })
  month: string;

  @Prop({ type: [Object], default: [] })
  components: RatingComponent[];

  /** Weighted score from the components that have data (0–100). */
  @Prop({ type: Number, default: 0 })
  autoScore: number;

  /** Admin adjustment, −20…+20. */
  @Prop({ type: Number, default: 0, min: -20, max: 20 })
  adjustment: number;

  @Prop({ trim: true, maxlength: 500, default: '' })
  adjustmentNote: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  adjustedBy: Types.ObjectId | null;

  /** clamp(autoScore + adjustment, 0, 100) */
  @Prop({ type: Number, default: 0 })
  finalScore: number;

  @Prop({ type: Date, default: Date.now })
  computedAt: Date;
}

export const MurabbiRatingSchema = SchemaFactory.createForClass(MurabbiRating);
MurabbiRatingSchema.index({ murabbi: 1, month: 1 }, { unique: true });
MurabbiRatingSchema.index({ month: 1, finalScore: -1 });
