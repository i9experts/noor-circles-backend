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
}

export const CircleSchema = SchemaFactory.createForClass(Circle);
