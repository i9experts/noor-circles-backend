import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SPACE_STATUSES, SPACE_TYPES } from './host.content';

export type HostSpaceDocument = HostSpace & Document;

/**
 * A space a host offers for a circle. It moves Offered → Visited → Approved →
 * In use; a circle can only be placed in an approved space. The address is
 * shown only to admins, the cluster's supervisors, the circle's murabbi and
 * enrolled families.
 */
@Schema({ timestamps: true })
export class HostSpace {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) host: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 100 }) name: string;
  @Prop({ type: String, enum: SPACE_TYPES.map((t) => t.value), default: 'other' }) type: string;
  @Prop({ trim: true, maxlength: 300, default: '' }) address: string;
  @Prop({ trim: true, maxlength: 100, default: '' }) city: string;
  @Prop({ trim: true, maxlength: 100, default: '' }) area: string;
  /** Links the space to a cluster (for supervisors) and to nearby circles. */
  @Prop({ type: Types.ObjectId, ref: 'Neighbourhood', default: null, index: true }) neighbourhood: Types.ObjectId | null;
  @Prop({ type: Number, min: 1, max: 200, default: 15 }) capacity: number;
  @Prop({ type: [String], default: [] }) facilities: string[];
  /** When the space is free, e.g. [{ day: 5, from: '16:00', to: '19:00' }] (0 = Sunday). */
  @Prop({ type: [{ day: Number, from: String, to: String, _id: false }], default: [] }) availability: { day: number; from: string; to: string }[];
  @Prop({ type: [String], default: [] }) photos: string[];
  @Prop({ trim: true, maxlength: 1000, default: '' }) notes: string;
  @Prop({ type: String, enum: SPACE_STATUSES, default: 'offered', index: true }) status: string;
  @Prop({ trim: true, maxlength: 1000, default: '' }) adminNotes: string;
  @Prop({ type: Types.ObjectId, ref: 'Interest', default: null }) interest: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) approvedAt: Date | null;
  @Prop({
    type: [{
      by: { type: Types.ObjectId, ref: 'User' }, byName: String, at: Date,
      checklist: [{ key: String, ok: Boolean, note: String, _id: false }],
      notes: String, recommendation: { type: String, enum: ['approve', 'changes', 'decline'] },
    }],
    default: [],
  })
  visits: {
    _id?: Types.ObjectId; by: Types.ObjectId; byName: string; at: Date;
    checklist: { key: string; ok: boolean; note: string }[]; notes: string; recommendation: 'approve' | 'changes' | 'decline';
  }[];
}
export const HostSpaceSchema = SchemaFactory.createForClass(HostSpace);

export type SpaceUnavailabilityDocument = SpaceUnavailability & Document;

/** A date a host's space can't be used. The circle's murabbi and the team are told at once. */
@Schema({ timestamps: true })
export class SpaceUnavailability {
  @Prop({ type: Types.ObjectId, ref: 'HostSpace', required: true, index: true }) space: Types.ObjectId;
  /** 'YYYY-MM-DD' */
  @Prop({ type: String, required: true }) date: string;
  @Prop({ trim: true, maxlength: 300, default: '' }) reason: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) createdBy: Types.ObjectId;
}
export const SpaceUnavailabilitySchema = SchemaFactory.createForClass(SpaceUnavailability);
SpaceUnavailabilitySchema.index({ space: 1, date: 1 }, { unique: true });

export type HostTrainingDocument = HostTraining & Document;

/** A host's progress through Asaas for Hosts. */
@Schema({ timestamps: true })
export class HostTraining {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true }) user: Types.ObjectId;
  /** moduleKey → when its check was passed */
  @Prop({ type: Object, default: {} }) passed: Record<string, string>;
  /** moduleKey → attempts so far */
  @Prop({ type: Object, default: {} }) attempts: Record<string, number>;
  @Prop({ type: String, default: null }) certificateNumber: string | null;
  @Prop({ type: Date, default: null }) certifiedAt: Date | null;
}
export const HostTrainingSchema = SchemaFactory.createForClass(HostTraining);

export type HostModuleAudioDocument = HostModuleAudio & Document;

/** Optional audio for a training module, uploaded later by an admin. */
@Schema({ timestamps: true })
export class HostModuleAudio {
  @Prop({ type: String, required: true, unique: true }) module: string;
  @Prop({ type: Types.ObjectId, required: true }) file: Types.ObjectId;
  @Prop({ type: Number, default: 0 }) durationSec: number;
}
export const HostModuleAudioSchema = SchemaFactory.createForClass(HostModuleAudio);
