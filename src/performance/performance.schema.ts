import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PerformanceDocument = Performance & Document;

@Schema({ timestamps: true })
export class Performance {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  murabbi: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Circle', required: true })
  circle: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1 })
  sessionNumber: number;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  reviewText: string;

  @Prop({ type: Number, min: 0, max: 5, default: 0 })
  stars: number;

  @Prop({ type: Boolean, default: false })
  requiresFollowUp: boolean;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  honestyScore: number;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  gratitudeScore: number;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  empathyScore: number;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  identityScore: number;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  familyScore: number;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  consistencyScore: number;
}

export const PerformanceSchema = SchemaFactory.createForClass(Performance);
