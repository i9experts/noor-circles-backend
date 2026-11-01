import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FounderProfileDocument = FounderProfile & Document;

/** The founder's profile shown to murabbis, parents and on the website (one document). */
@Schema({ timestamps: true })
export class FounderProfile {
  @Prop({ type: String, default: 'founder', unique: true }) key: string;
  /** Only the fields an admin has changed; the rest come from FOUNDER_DEFAULTS. */
  @Prop({ type: Object, default: {} }) content: Record<string, unknown>;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) updatedBy: Types.ObjectId | null;
}
export const FounderProfileSchema = SchemaFactory.createForClass(FounderProfile);
