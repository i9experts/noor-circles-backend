import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TrainingModuleDocument = TrainingModule & Document;
export type TrainingProgressDocument = TrainingProgress & Document;

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
}

export const TrainingModuleSchema = SchemaFactory.createForClass(TrainingModule);

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
