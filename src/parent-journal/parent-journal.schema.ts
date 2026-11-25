import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ParentJournalEntryDocument = ParentJournalEntry & Document;

/** One page of a parent's journal. Private: only the parent reads it (the team sees counts only). */
@Schema({ timestamps: true })
export class ParentJournalEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user: Types.ObjectId;
  @Prop({ type: String, required: true }) page: string;
  @Prop({ type: Object, default: {} }) answers: Record<string, string>;
  @Prop({ type: Boolean, default: false }) done: boolean;
}
export const ParentJournalEntrySchema = SchemaFactory.createForClass(ParentJournalEntry);
ParentJournalEntrySchema.index({ user: 1, page: 1 }, { unique: true });

export type ParentJournalMomentDocument = ParentJournalMoment & Document;

/** A "moment at home" worth remembering. Private to the parent. */
@Schema({ timestamps: true })
export class ParentJournalMoment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user: Types.ObjectId;
  /** 'YYYY-MM-DD' */
  @Prop({ type: String, required: true }) date: string;
  @Prop({ type: String, required: true, maxlength: 2000 }) text: string;
}
export const ParentJournalMomentSchema = SchemaFactory.createForClass(ParentJournalMoment);
ParentJournalMomentSchema.index({ user: 1, date: -1 });
