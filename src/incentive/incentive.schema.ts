import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IncentiveDocument = Incentive & Document;

export type AwardType =
  | 'noor-star'
  | 'circle-champion'
  | 'sadaqah-hero'
  | 'knowledge-seeker'
  | 'kindness-award'
  | 'courage-award';

export const AWARD_POINTS: Record<AwardType, number> = {
  'noor-star'       : 50,
  'circle-champion' : 100,
  'sadaqah-hero'    : 75,
  'knowledge-seeker': 25,
  'kindness-award'  : 30,
  'courage-award'   : 40,
};

@Schema({ timestamps: true })
export class Incentive {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  student: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['noor-star', 'circle-champion', 'sadaqah-hero', 'knowledge-seeker', 'kindness-award', 'courage-award'],
    required: true,
  })
  awardType: AwardType;

  @Prop({ type: Number, required: true })
  points: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  awardedBy: Types.ObjectId;

  @Prop({ trim: true, maxlength: 300, default: '' })
  note: string;
}

export const IncentiveSchema = SchemaFactory.createForClass(Incentive);
