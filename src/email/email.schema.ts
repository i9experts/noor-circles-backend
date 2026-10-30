import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Kinds people can switch off. Everything else (account, receipts, results) always goes. */
export const OPTIONAL_CATEGORIES = ['training-reminders', 'announcements'] as const;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];

export const EMAIL_STATUSES = ['queued', 'sending', 'sent', 'failed', 'skipped', 'cancelled'] as const;

// ── One email (queued, then sent) ────────────────────────────────────────────

export type EmailLogDocument = EmailLog & Document;

@Schema({ timestamps: true })
export class EmailLog {
  /** Template kind, e.g. "account.welcome", "training.reminder", "campaign". */
  @Prop({ required: true, index: true }) kind: string;
  @Prop({ type: String, default: null }) category: string | null;
  @Prop({ required: true, lowercase: true, trim: true }) to: string;
  @Prop({ trim: true, default: '' }) toName: string;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) user: Types.ObjectId | null;
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) html: string;
  @Prop({ default: '' }) text: string;
  /** Generated when sending (e.g. a certificate PDF), not stored. */
  @Prop({ type: Object, default: null }) attachment: { type: 'certificate'; userId: string; tier: number } | null;
  @Prop({ type: String, enum: EMAIL_STATUSES, default: 'queued', index: true }) status: string;
  @Prop({ type: Number, default: 0 }) attempts: number;
  @Prop({ type: String, default: '' }) error: string;
  @Prop({ type: Date, default: () => new Date() }) sendAfter: Date;
  @Prop({ type: Date, default: null }) sentAt: Date | null;
  @Prop({ type: Types.ObjectId, ref: 'EmailCampaign', default: null }) campaign: Types.ObjectId | null;
  /** Prevents sending the same thing twice (e.g. one reminder per assignment). */
  @Prop({ type: String, default: null }) dedupeKey: string | null;
}
export const EmailLogSchema = SchemaFactory.createForClass(EmailLog);
EmailLogSchema.index({ status: 1, sendAfter: 1 });
EmailLogSchema.index({ campaign: 1, status: 1 });
EmailLogSchema.index({ createdAt: -1 });
EmailLogSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

// ── Preferences (by address, so people without an account can unsubscribe) ──

export type EmailPreferenceDocument = EmailPreference & Document;

@Schema({ timestamps: true })
export class EmailPreference {
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
  @Prop({ type: [String], default: [] }) optOut: string[];
}
export const EmailPreferenceSchema = SchemaFactory.createForClass(EmailPreference);

// ── Group emails written by admins ───────────────────────────────────────────

export const AUDIENCE_TYPES = [
  'murabbis', 'murabbis-tier', 'murabbis-training', 'parents', 'parents-circle', 'parents-neighbourhood', 'families',
] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export type EmailCampaignDocument = EmailCampaign & Document;

@Schema({ timestamps: true })
export class EmailCampaign {
  @Prop({ required: true, trim: true, maxlength: 200 }) subject: string;
  @Prop({ required: true, maxlength: 20000 }) body: string;
  @Prop({ type: Object, required: true }) audience: { type: AudienceType; ids?: string[]; tier?: number; status?: string; families?: string[] };
  @Prop({ trim: true, default: '' }) audienceLabel: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) createdBy: Types.ObjectId;
  @Prop({ type: Date, default: null }) scheduledFor: Date | null;
  /** scheduled → sending (queued) → sent; or cancelled. */
  @Prop({ type: String, enum: ['scheduled', 'queued', 'cancelled'], default: 'queued' }) status: string;
  @Prop({ type: Number, default: 0 }) recipients: number;
  @Prop({ type: Number, default: 0 }) skipped: number;
}
export const EmailCampaignSchema = SchemaFactory.createForClass(EmailCampaign);
EmailCampaignSchema.index({ status: 1, scheduledFor: 1 });
