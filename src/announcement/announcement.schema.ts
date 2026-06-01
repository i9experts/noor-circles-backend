import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AnnouncementDocument = Announcement & Document;

export enum AnnouncementIcon {
  SESSION  = 'session',
  TRAINING = 'training',
  DONOR    = 'donor',
  INFO     = 'info',
}

@Schema({ timestamps: true })
export class Announcement {
  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 300 })
  body: string;

  @Prop({ type: String, enum: AnnouncementIcon, default: AnnouncementIcon.INFO })
  icon: AnnouncementIcon;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);

AnnouncementSchema.index({ createdAt: -1 });
