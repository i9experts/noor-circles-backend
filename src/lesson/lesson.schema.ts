import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LessonDocument = Lesson & Document;

@Schema({ timestamps: true })
export class Lesson {
  @Prop({ required: true, trim: true, maxlength: 150 })
  title: string;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  description: string;

  @Prop({ trim: true, maxlength: 100, default: '' })
  module: string;

  @Prop({ trim: true, maxlength: 50, default: '' })
  level: string;

  @Prop({ trim: true, maxlength: 50, default: '' })
  duration: string;

  @Prop({ type: String, enum: ['Available', 'Upcoming', 'Draft'], default: 'Available' })
  status: string;

  @Prop({ trim: true, default: null })
  pdfUrl: string | null;

  @Prop({ trim: true, default: null })
  videoUrl: string | null;

  @Prop({ type: Number, default: 0 })
  order: number;

  @Prop({ type: Number, default: null })
  sessionNumber: number | null;

  @Prop({ type: [String], default: [] })
  objectives: string[];

  @Prop({ type: [String], default: [] })
  keyTopics: string[];
}

export const LessonSchema = SchemaFactory.createForClass(Lesson);
