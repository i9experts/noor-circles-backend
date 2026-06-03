import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EngagementConfigDocument = EngagementConfig & Document;

@Schema({ timestamps: true })
export class EngagementConfig {
  /** Weekly Home Action Card toggle */
  @Prop({ type: Boolean, default: true })
  weeklyCardActive: boolean;

  /** WhatsApp Updates toggle */
  @Prop({ type: Boolean, default: true })
  whatsappEnabled: boolean;

  /** Which month the next parent evening is scheduled (null = not scheduled) */
  @Prop({ type: Number, default: null })
  scheduledEveningMonth: number | null;

  /** How many parent evenings have been held */
  @Prop({ type: Number, default: 0 })
  parentEveningsHeld: number;

  /** Last time WhatsApp brief was sent */
  @Prop({ type: Date, default: null })
  lastWhatsappSentAt: Date | null;

  /** Who sent the last WhatsApp brief */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  lastWhatsappSentBy: Types.ObjectId | null;

  /** Brief message of last WhatsApp send */
  @Prop({ type: String, default: null, maxlength: 500 })
  lastWhatsappMessage: string | null;
}

export const EngagementConfigSchema = SchemaFactory.createForClass(EngagementConfig);
