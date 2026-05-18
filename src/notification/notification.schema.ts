import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  STUDENT_ASSIGNED    = 'student_assigned',     // admin → murabbi
  CIRCLE_ASSIGNED     = 'circle_assigned',      // admin → murabbi
  MURABBI_ACTION      = 'murabbi_action',       // murabbi → admin (info)
  DELETE_REQUEST      = 'delete_request',       // murabbi → admin (requires approval)
  PERFORMANCE_REVIEW  = 'performance_review',   // admin → murabbi (review submitted)
}

export enum NotificationStatus {
  UNREAD   = 'unread',
  READ     = 'read',
  PENDING  = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recipient: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: Types.ObjectId;

  @Prop({ type: String, enum: NotificationType, required: true })
  type: NotificationType;

  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 400 })
  message: string;

  @Prop({ type: String, enum: NotificationStatus, default: NotificationStatus.UNREAD })
  status: NotificationStatus;

  @Prop({ type: Boolean, default: false })
  requiresApproval: boolean;

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, status: 1 });
