import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const REGISTER_TYPES = ['murabbi', 'parent', 'host'] as const;
export type RegisterType = (typeof REGISTER_TYPES)[number];
export const FOLLOW_UP_STATUSES = ['new', 'to-contact', 'in-progress', 'done', 'no-response'] as const;
export const NOTE_KINDS = ['call', 'whatsapp', 'visit', 'email', 'note'] as const;

export type RegisterFollowUpDocument = RegisterFollowUp & Document;

/**
 * The team's follow-up on one person in a register (admin only). For murabbis
 * and hosts the subject is their user; for parents it is the parent record,
 * since a parent may not have an account yet.
 */
@Schema({ timestamps: true })
export class RegisterFollowUp {
  @Prop({ type: String, enum: REGISTER_TYPES, required: true }) subjectType: RegisterType;
  @Prop({ type: Types.ObjectId, required: true }) subject: Types.ObjectId;
  @Prop({ type: String, enum: FOLLOW_UP_STATUSES, default: 'new' }) status: string;
  /** 'YYYY-MM-DD' (Pakistan time) or null. */
  @Prop({ type: String, default: null }) nextDate: string | null;
  @Prop({
    type: [{ at: Date, by: { type: Types.ObjectId, ref: 'User' }, byName: String, kind: { type: String, enum: NOTE_KINDS }, text: String }],
    default: [],
  })
  notes: { _id?: Types.ObjectId; at: Date; by: Types.ObjectId; byName: string; kind: string; text: string }[];
}
export const RegisterFollowUpSchema = SchemaFactory.createForClass(RegisterFollowUp);
RegisterFollowUpSchema.index({ subjectType: 1, subject: 1 }, { unique: true });
RegisterFollowUpSchema.index({ nextDate: 1, status: 1 });
