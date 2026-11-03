import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type JournalEntryDocument = JournalEntry & Document;

/** One page of a murabbi's Noor Journal. The murabbi writes it; admins can read it to support them. */
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

/** A "moment of light" from a real circle. Admins can read it and feature it (by name only with consent). */
@Schema({ timestamps: true })
export class JournalMoment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user: Types.ObjectId;
  /** 'YYYY-MM-DD' */
  @Prop({ type: String, required: true }) date: string;
  @Prop({ type: String, required: true, maxlength: 1500 }) text: string;
  @Prop({ type: Types.ObjectId, ref: 'Circle', default: null }) circle: Types.ObjectId | null;
  /** The murabbi agrees their name may appear if the team features this moment. */
  @Prop({ type: Boolean, default: false }) shareName: boolean;
  /** Chosen by an admin for the newsletter or donor updates. */
  @Prop({ type: Boolean, default: false }) featured: boolean;
  @Prop({ type: Date, default: null }) featuredAt: Date | null;
}
export const JournalMomentSchema = SchemaFactory.createForClass(JournalMoment);
JournalMomentSchema.index({ user: 1, date: -1 });
