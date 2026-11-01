import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { Introduction } from './murabbi-profile.options';

export type MurabbiProfileDocument = MurabbiProfile & Document;

/** A murabbi's introduction. Admin-only (and the murabbi themselves). */
@Schema({ timestamps: true })
export class MurabbiProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true }) user: Types.ObjectId;
  @Prop({ type: Object, required: true }) data: Introduction;
  /** 0–100: how many of the main sections have answers. */
  @Prop({ type: Number, default: 0 }) completeness: number;
  /** Who saved it last (the murabbi, or an admin filling it in for them). */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) updatedBy: Types.ObjectId | null;
}
export const MurabbiProfileSchema = SchemaFactory.createForClass(MurabbiProfile);
