import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const POOL_STATUSES       = ['draft', 'approved', 'completed'] as const;
export const ALLOCATION_STATUSES = ['proposed', 'approved', 'paid', 'cancelled'] as const;
export const PAYOUT_METHODS      = ['cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'gift', 'voucher', 'other'] as const;

export type PoolStatus       = (typeof POOL_STATUSES)[number];
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

// ── Pool ─────────────────────────────────────────────────────────────────────
export type RewardPoolDocument = RewardPool & Document;

/** One month's incentive budget, funded from contributions. */
@Schema({ timestamps: true })
export class RewardPool {
  @Prop({ required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ })
  month: string;

  @Prop({ type: String, enum: ['fixed', 'percent'], required: true })
  budgetMode: 'fixed' | 'percent';

  /** PKR (fixed) or % of the month's contributions (percent). */
  @Prop({ type: Number, required: true, min: 0 })
  budgetValue: number;

  /** Contributions collected in the month when the budget was last calculated. */
  @Prop({ type: Number, default: 0 })
  contributionsCollected: number;

  /** Total PKR available. */
  @Prop({ type: Number, required: true, min: 0 })
  budget: number;

  /** % of the budget for students; the rest goes to murabbis. */
  @Prop({ type: Number, default: 60, min: 0, max: 100 })
  studentSharePct: number;

  @Prop({ type: Number, default: 10, min: 0, max: 100 })
  maxStudents: number;

  @Prop({ type: Number, default: 5, min: 0, max: 100 })
  maxMurabbis: number;

  /** Murabbis below this final rating aren't proposed. */
  @Prop({ type: Number, default: 60, min: 0, max: 100 })
  minMurabbiScore: number;

  @Prop({ type: String, enum: POOL_STATUSES, default: 'draft' })
  status: PoolStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  approvedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  approvedAt: Date | null;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  notes: string;
}
export const RewardPoolSchema = SchemaFactory.createForClass(RewardPool);
RewardPoolSchema.index({ month: 1 }, { unique: true });

// ── Allocation ───────────────────────────────────────────────────────────────
export type RewardAllocationDocument = RewardAllocation & Document;

@Schema({ timestamps: true })
export class RewardAllocation {
  @Prop({ type: Types.ObjectId, ref: 'RewardPool', required: true })
  pool: Types.ObjectId;

  @Prop({ required: true })
  month: string;

  @Prop({ type: String, enum: ['student', 'murabbi'], required: true })
  recipientType: 'student' | 'murabbi';

  @Prop({ type: Types.ObjectId, ref: 'Student', default: null })
  student: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  murabbi: Types.ObjectId | null;

  /** Points earned (student) or final rating (murabbi) when proposed. */
  @Prop({ type: Number, default: 0 })
  basisValue: number;

  @Prop({ type: Number, default: 0 })
  rank: number;

  /** PKR */
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: String, enum: ALLOCATION_STATUSES, default: 'proposed' })
  status: AllocationStatus;

  @Prop({ type: Boolean, default: false })
  manual: boolean;

  @Prop({ type: String, enum: [...PAYOUT_METHODS, null], default: null })
  method: string | null;

  @Prop({ trim: true, maxlength: 120, default: '' })
  reference: string;

  @Prop({ type: Date, default: null })
  paidAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  paidBy: Types.ObjectId | null;

  @Prop({ trim: true, maxlength: 500, default: '' })
  notes: string;
}
export const RewardAllocationSchema = SchemaFactory.createForClass(RewardAllocation);
RewardAllocationSchema.index({ pool: 1, recipientType: 1 });
RewardAllocationSchema.index({ murabbi: 1, status: 1 });
RewardAllocationSchema.index({ student: 1, status: 1 });
