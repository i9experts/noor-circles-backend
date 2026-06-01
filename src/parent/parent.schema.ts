import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ParentDocument = Parent & Document;

@Schema({ _id: false })
class ParentFeedback {
  @Prop({ trim: true, maxlength: 500, default: '' })
  message: string;

  @Prop({ type: Number, min: 1, max: 5, default: 5 })
  stars: number;

  @Prop({ type: Number, min: 1 })
  sessionNumber: number;

  @Prop({ type: Date, default: Date.now })
  date: Date;
}

const ParentFeedbackSchema = SchemaFactory.createForClass(ParentFeedback);

@Schema({ timestamps: true })
export class Parent {
  @Prop({ required: true, trim: true, maxlength: 100 })
  fullName: string;

  @Prop({ required: true, trim: true, maxlength: 20 })
  phone: string;

  @Prop({ trim: true, lowercase: true, default: null })
  email: string | null;

  @Prop({ trim: true, maxlength: 20, default: null })
  whatsappNumber: string | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Student' }], default: [] })
  students: Types.ObjectId[];

  @Prop({ type: [ParentFeedbackSchema], default: [] })
  feedback: ParentFeedback[];

  @Prop({ type: Boolean, default: true })
  isEngaged: boolean;

  @Prop({ trim: true, maxlength: 300, default: '' })
  notes: string;
}

export const ParentSchema = SchemaFactory.createForClass(Parent);

ParentSchema.index({ isEngaged: 1 });
ParentSchema.index({ phone: 1 });
