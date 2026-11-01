import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const REQUEST_STATUSES = ['pending', 'approved', 'declined', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type TrainingRequestDocument = TrainingRequest & Document;

/** A murabbi or parent asking to join a training from the marketplace; an admin approves each one. */
@Schema({ timestamps: true })
export class TrainingRequest {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true }) course: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })   user: Types.ObjectId;
  @Prop({ type: String, enum: REQUEST_STATUSES, default: 'pending' }) status: RequestStatus;
  @Prop({ trim: true, maxlength: 500, default: '' })              note: string;
  /** Why it was declined (sent to the person). */
  @Prop({ trim: true, maxlength: 500, default: '' })              reason: string;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })     decidedBy: Types.ObjectId | null;
  @Prop({ type: Date, default: null })                            decidedAt: Date | null;
}
export const TrainingRequestSchema = SchemaFactory.createForClass(TrainingRequest);
TrainingRequestSchema.index({ course: 1, user: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
TrainingRequestSchema.index({ status: 1, createdAt: -1 });
