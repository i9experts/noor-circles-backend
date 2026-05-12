import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NeighbourhoodDocument = Neighbourhood & Document;

@Schema({ timestamps: true })
export class Neighbourhood {
  @Prop({ required: true, unique: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ trim: true, maxlength: 100, default: null })
  city: string | null;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const NeighbourhoodSchema = SchemaFactory.createForClass(Neighbourhood);
