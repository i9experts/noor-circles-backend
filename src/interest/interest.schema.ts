import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InterestDocument = Interest & Document;

export const INTEREST_ROLES = ['parent', 'mentor', 'host'] as const;
export type InterestRole = (typeof INTEREST_ROLES)[number];

export const INTEREST_STATUSES = ['new', 'contacted', 'closed'] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

/** An expression of interest submitted from the public landing page. */
@Schema({ timestamps: true })
export class Interest {
  @Prop({ type: String, enum: INTEREST_ROLES, required: true })
  role: InterestRole;

  @Prop({ required: true, trim: true, maxlength: 60 })
  firstName: string;

  @Prop({ required: true, trim: true, maxlength: 60 })
  lastName: string;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 120 })
  email: string;

  @Prop({ required: true, trim: true, maxlength: 30 })
  phone: string;

  @Prop({ required: true, trim: true, maxlength: 80 })
  city: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  neighbourhood: string;

  /** Child's age band (parent), background (mentor) or space type (host). */
  @Prop({ trim: true, maxlength: 80, default: '' })
  roleDetail: string;

  @Prop({ type: String, enum: INTEREST_STATUSES, default: 'new' })
  status: InterestStatus;

  /** Internal follow-up notes (admin only). */
  @Prop({ trim: true, maxlength: 1000, default: '' })
  notes: string;

  /** Parents' optional "about your family" answers (admin-only). */
  @Prop({ type: Object, default: null })
  profile: Record<string, unknown> | null;

  /** The portal account created from this request (murabbi or parent). */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  account: Types.ObjectId | null;
}

export const InterestSchema = SchemaFactory.createForClass(Interest);
InterestSchema.index({ status: 1, createdAt: -1 });
InterestSchema.index({ role: 1 });
