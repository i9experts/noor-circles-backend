import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const MIN_MONTHLY_PLEDGE = 250; // PKR

export const CONTRIBUTOR_TYPES    = ['parent', 'supporter'] as const;
export const CONTRIBUTOR_STATUSES = ['pending', 'active', 'paused', 'cancelled'] as const;
export const FREQUENCIES          = ['monthly', 'once'] as const;
export const PAYMENT_METHODS      = ['cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'stripe', 'other'] as const;
export const MANUAL_METHODS       = PAYMENT_METHODS.filter((m) => m !== 'stripe');
export const PAYMENT_STATUSES     = ['succeeded', 'pending', 'failed', 'refunded', 'void'] as const;

export type ContributorType   = (typeof CONTRIBUTOR_TYPES)[number];
export type ContributorStatus = (typeof CONTRIBUTOR_STATUSES)[number];
export type Frequency         = (typeof FREQUENCIES)[number];
export type PaymentMethod     = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus     = (typeof PAYMENT_STATUSES)[number];

// ── Contributor ──────────────────────────────────────────────────────────────
export type ContributorDocument = Contributor & Document;

/** A family (parent) or supporter who contributes — never a fee. */
@Schema({ timestamps: true })
export class Contributor {
  @Prop({ type: String, enum: CONTRIBUTOR_TYPES, required: true })
  type: ContributorType;

  /** Linked parent record (type = parent). */
  @Prop({ type: Types.ObjectId, ref: 'Parent', default: null })
  parent: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 100 })
  fullName: string;

  @Prop({ trim: true, lowercase: true, maxlength: 120, default: null })
  email: string | null;

  @Prop({ trim: true, maxlength: 30, default: null })
  phone: string | null;

  @Prop({ type: String, enum: FREQUENCIES, default: 'monthly' })
  frequency: Frequency;

  /** PKR per month (monthly) — minimum 250. For one-time supporters, the amount pledged. */
  @Prop({ type: Number, required: true, min: MIN_MONTHLY_PLEDGE })
  monthlyPledge: number;

  /** First month the pledge applies to ('YYYY-MM', PKT). */
  @Prop({ required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ })
  startMonth: string;

  @Prop({ type: String, enum: CONTRIBUTOR_STATUSES, default: 'active' })
  status: ContributorStatus;

  /**
   * Periods with no expected contribution (paused / cancelled). `to` is null
   * while still inactive. Kept so history and arrears stay accurate across
   * pause → resume cycles.
   */
  @Prop({ type: [{ from: String, to: { type: String, default: null }, _id: false }], default: [] })
  inactivePeriods: { from: string; to: string | null }[];

  @Prop({ type: String, enum: ['admin', 'website'], default: 'admin' })
  source: 'admin' | 'website';

  @Prop({ type: String, enum: PAYMENT_METHODS, default: 'cash' })
  preferredMethod: PaymentMethod;

  @Prop({ type: String, default: null })
  stripeCustomerId: string | null;

  @Prop({ type: String, default: null })
  stripeSubscriptionId: string | null;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  notes: string;
}

export const ContributorSchema = SchemaFactory.createForClass(Contributor);
ContributorSchema.index({ status: 1, type: 1 });
ContributorSchema.index({ parent: 1 });
ContributorSchema.index({ stripeSubscriptionId: 1 }, { unique: true, partialFilterExpression: { stripeSubscriptionId: { $type: 'string' } } });

// ── Contribution (one payment) ───────────────────────────────────────────────
export type ContributionDocument = Contribution & Document;

@Schema({ timestamps: true })
export class Contribution {
  @Prop({ type: Types.ObjectId, ref: 'Contributor', required: true })
  contributor: Types.ObjectId;

  /** PKR (whole rupees). */
  @Prop({ type: Number, required: true, min: 1 })
  amount: number;

  /** The month this payment counts toward ('YYYY-MM', PKT). */
  @Prop({ required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ })
  month: string;

  @Prop({ type: String, enum: PAYMENT_METHODS, required: true })
  method: PaymentMethod;

  @Prop({ type: String, enum: PAYMENT_STATUSES, default: 'succeeded' })
  status: PaymentStatus;

  /** Human-readable, unique, e.g. NC-202610-00042. */
  @Prop({ required: true })
  receiptNumber: string;

  /** Bank/JazzCash/Easypaisa transaction id, cheque no., etc. */
  @Prop({ trim: true, maxlength: 120, default: '' })
  reference: string;

  @Prop({ type: Date, default: Date.now })
  receivedAt: Date;

  /** Admin who recorded it (null for Stripe). */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  recordedBy: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  stripeInvoiceId: string | null;

  @Prop({ type: String, default: null })
  stripePaymentIntentId: string | null;

  @Prop({ trim: true, maxlength: 500, default: '' })
  notes: string;
}

export const ContributionSchema = SchemaFactory.createForClass(Contribution);
ContributionSchema.index({ month: 1, status: 1 });
ContributionSchema.index({ contributor: 1, month: 1 });
ContributionSchema.index({ receiptNumber: 1 }, { unique: true });
ContributionSchema.index({ stripeInvoiceId: 1 }, { unique: true, partialFilterExpression: { stripeInvoiceId: { $type: 'string' } } });
ContributionSchema.index({ stripePaymentIntentId: 1 }, { unique: true, partialFilterExpression: { stripePaymentIntentId: { $type: 'string' } } });

// ── Counter (receipt numbers) ────────────────────────────────────────────────
export type CounterDocument = Counter & Document;

@Schema({ collection: 'counters' })
export class Counter {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: Number, default: 0 })
  seq: number;
}
export const CounterSchema = SchemaFactory.createForClass(Counter);
