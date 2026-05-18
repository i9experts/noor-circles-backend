import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LiveSessionDocument = LiveSession & Document;

@Schema({ timestamps: true })
export class LiveSession {
  @Prop({ required: true, trim: true, maxlength: 150 })
  title: string;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ required: true, trim: true })
  zoomLink: string;

  @Prop({ type: Date })
  scheduledAt: Date;

  @Prop({ type: Number, default: 60 })
  durationMinutes: number;

  @Prop({ type: Boolean, default: false })
  isRecurring: boolean;

  @Prop({ type: Number, min: 0, max: 6 })
  recurringDay: number;   // 0=Sun 1=Mon ... 6=Sat

  @Prop({ trim: true })
  recurringTime: string;  // "HH:MM"

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const LiveSessionSchema = SchemaFactory.createForClass(LiveSession);