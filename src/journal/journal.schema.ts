import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type JournalEntryDocument = JournalEntry & Document;

/** One page of a murabbi's Noor Journal. Private: only the murabbi reads it. */
@Schema({ timestamps: true })
export class JournalEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user: Types.ObjectId;
  @Prop({ type: String, required: true }) page: string;
  @Prop({ type: Object, default: {} }) answers: Record<string, string>;
  @Prop({ type: Boolean, default: false }) done: boolean;
}
export const JournalEntrySchema = SchemaFactory.createForClass(JournalEntry);
JournalEntrySchema.index({ user: 1, page: 1 }, { unique: true });

export type JournalMomentDocument = JournalMoment & Document;

/** A "moment of light" from a real circle (private to the murabbi). */
@Schema({ timestamps: true })
export class JournalMoment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user: Types.ObjectId;
  /** 'YYYY-MM-DD' */
  @Prop({ type: String, required: true }) date: string;
  @Prop({ type: String, required: true, maxlength: 1500 }) text: string;
  @Prop({ type: Types.ObjectId, ref: 'Circle', default: null }) circle: Types.ObjectId | null;
}
export const JournalMomentSchema = SchemaFactory.createForClass(JournalMoment);
JournalMomentSchema.index({ user: 1, date: -1 });
