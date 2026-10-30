import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { VISIT_RATINGS, VisitRating } from './visit-checklist';

export type ClusterDocument = Cluster & Document;

/** A group of neighbourhoods looked after by one or more cluster supervisors. */
@Schema({ timestamps: true })
export class Cluster {
  @Prop({ required: true, unique: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ trim: true, maxlength: 100, default: '' })
  city: string;

  /** A neighbourhood belongs to at most one cluster (enforced by the service). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Neighbourhood' }], default: [] })
  neighbourhoods: Types.ObjectId[];

  /** Supervisor accounts; a supervisor can look after several clusters. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  supervisors: Types.ObjectId[];

  @Prop({ trim: true, maxlength: 1000, default: '' })
  notes: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}
export const ClusterSchema = SchemaFactory.createForClass(Cluster);
ClusterSchema.index({ neighbourhoods: 1 });
ClusterSchema.index({ supervisors: 1 });

@Schema({ _id: false })
export class VisitScore {
  @Prop({ type: String, required: true }) key: string;
  @Prop({ type: String, default: '' })    title: string;
  /** 0 needs support, 1 good, 2 strong; null = not seen. */
  @Prop({ type: Number, min: 0, max: 2, default: null }) score: number | null;
  @Prop({ trim: true, maxlength: 300, default: '' }) note: string;
}
export const VisitScoreSchema = SchemaFactory.createForClass(VisitScore);

@Schema({ _id: true })
export class FollowUp {
  @Prop({ required: true, trim: true, maxlength: 300 }) text: string;
  @Prop({ type: Boolean, default: false })               done: boolean;
  @Prop({ type: Date, default: null })                   doneAt: Date | null;
}
export const FollowUpSchema = SchemaFactory.createForClass(FollowUp);

export type ClusterVisitDocument = ClusterVisit & Document;

/** A supervisor's report on a visit to one circle. */
@Schema({ timestamps: true })
export class ClusterVisit {
  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true }) cluster: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Circle', required: true })  circle: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })    supervisor: Types.ObjectId;
  /** 'YYYY-MM-DD' (Pakistan time). */
  @Prop({ type: String, required: true })                         date: string;
  @Prop({ type: Number, min: 0, max: 100, default: null })        childrenPresent: number | null;
  @Prop({ type: [VisitScoreSchema], default: [] })                checklist: VisitScore[];
  @Prop({ type: String, enum: VISIT_RATINGS, required: true })    overall: VisitRating;
  @Prop({ trim: true, maxlength: 2000, default: '' })             highlights: string;
  @Prop({ trim: true, maxlength: 2000, default: '' })             concerns: string;
  /** A safeguarding concern was raised: admins are alerted at once. */
  @Prop({ type: Boolean, default: false })                        safeguarding: boolean;
  @Prop({ type: [FollowUpSchema], default: [] })                  followUps: FollowUp[];
}
export const ClusterVisitSchema = SchemaFactory.createForClass(ClusterVisit);
ClusterVisitSchema.index({ cluster: 1, date: -1 });
ClusterVisitSchema.index({ circle: 1, date: -1 });
