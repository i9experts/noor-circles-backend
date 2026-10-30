import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Asaas for Parents: what a parent does beyond listening (which lives in the
// shared course collections). Seen only by the parent and admins.

export const PARENT_QUIZZES = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'final'] as const;
export type ParentQuizKey = (typeof PARENT_QUIZZES)[number];

export type ParentQuizAttemptDocument = ParentQuizAttempt & Document;

/** One go at a module knowledge check (10 questions) or the final check (20). */
@Schema({ timestamps: true })
export class ParentQuizAttempt {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true }) course: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })   user: Types.ObjectId;
  @Prop({ type: String, enum: PARENT_QUIZZES, required: true })  quiz: ParentQuizKey;
  @Prop({ type: [Number], default: [] })                         answers: number[];
  @Prop({ type: Number, required: true })                        correct: number;
  @Prop({ type: Number, required: true })                        total: number;
  @Prop({ type: Boolean, required: true })                       passed: boolean;
}
export const ParentQuizAttemptSchema = SchemaFactory.createForClass(ParentQuizAttempt);
ParentQuizAttemptSchema.index({ course: 1, user: 1, quiz: 1, createdAt: 1 });

export type ParentSelfCheckDocument = ParentSelfCheck & Document;

/** The self-check, filled in on day one ('start') and again at the end ('end'). */
@Schema({ timestamps: true })
export class ParentSelfCheck {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true }) course: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })   user: Types.ObjectId;
  @Prop({ type: String, enum: ['start', 'end'], required: true }) stage: 'start' | 'end';
  /** One answer per statement: 0 never … 3 almost every day. */
  @Prop({ type: [Number], required: true })                      answers: number[];
}
export const ParentSelfCheckSchema = SchemaFactory.createForClass(ParentSelfCheck);
ParentSelfCheckSchema.index({ course: 1, user: 1, stage: 1 }, { unique: true });

export type ParentTargetDocument = ParentTarget & Document;

/** A module's target card: the boxes the child has ticked. */
@Schema({ timestamps: true })
export class ParentTarget {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true }) course: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })   user: Types.ObjectId;
  @Prop({ type: Number, min: 1, max: 8, required: true })        module: number;
  /** Ticked boxes (for daily targets, the day of the fortnight, 0–13). */
  @Prop({ type: [Number], default: [] })                         ticks: number[];
  /** The parent chose the lighter target the audio offers (shift work, single parent, …). */
  @Prop({ type: Boolean, default: false })                       lighter: boolean;
  @Prop({ type: Date, default: null })                           metAt: Date | null;
}
export const ParentTargetSchema = SchemaFactory.createForClass(ParentTarget);
ParentTargetSchema.index({ course: 1, user: 1, module: 1 }, { unique: true });
