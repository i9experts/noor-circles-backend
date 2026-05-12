import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentDocument = Student & Document;

@Schema({ timestamps: true })
export class Student {
  @Prop({ required: true, trim: true, maxlength: 100 })
  fullName: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  fatherName: string;

  @Prop({ required: true, trim: true, maxlength: 20 })
  phone: string;

  @Prop({ trim: true, lowercase: true, default: null })
  email: string | null;

  @Prop({ type: Date, default: null })
  dateOfBirth: Date | null;

  @Prop({ trim: true, maxlength: 200, default: null })
  address: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Circle', required: true })
  circle: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Neighbourhood', required: true })
  neighbourhood: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  enrollmentDate: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const StudentSchema = SchemaFactory.createForClass(Student);
