import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NeighbourhoodDocument  = Neighbourhood  & Document;
export type NeighbourhoodPipelineDocument = NeighbourhoodPipeline & Document;

// ── Active Neighbourhood ──────────────────────────────────────────────────────

@Schema({ timestamps: true })
export class Neighbourhood {
  @Prop({ required: true, unique: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ trim: true, maxlength: 100, default: null })
  city: string | null;

  /** Sub-area, e.g. "East Karachi" */
  @Prop({ trim: true, maxlength: 100, default: null })
  area: string | null;

  /** Mosque names, comma-separated, e.g. "Masjid Bilal, Masjid Umar" */
  @Prop({ trim: true, maxlength: 300, default: null })
  mosques: string | null;

  @Prop({ type: String, enum: ['active', 'review', 'inactive'], default: 'active' })
  status: 'active' | 'review' | 'inactive';

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const NeighbourhoodSchema = SchemaFactory.createForClass(Neighbourhood);
NeighbourhoodSchema.index({ city: 1 });
NeighbourhoodSchema.index({ status: 1 });

// ── Expansion Pipeline ────────────────────────────────────────────────────────

@Schema({ timestamps: true })
export class NeighbourhoodPipeline {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ trim: true, maxlength: 100, default: '' })
  area: string;

  @Prop({ trim: true, maxlength: 200, default: null })
  mosqueContact: string | null;

  @Prop({ type: Number, default: 1, min: 1 })
  targetCircles: number;

  /** 0–100 interest/progress indicator */
  @Prop({ type: Number, default: 50, min: 0, max: 100 })
  interestLevel: number;

  @Prop({ type: String, enum: ['prospecting', 'in-talks', 'ready-to-launch'], default: 'prospecting' })
  status: 'prospecting' | 'in-talks' | 'ready-to-launch';
}

export const NeighbourhoodPipelineSchema = SchemaFactory.createForClass(NeighbourhoodPipeline);
NeighbourhoodPipelineSchema.index({ status: 1 });
