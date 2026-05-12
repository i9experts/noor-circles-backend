import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AttendanceDocument = Attendance & Document;

export type AttendanceStatus = 'present' | 'absent' | 'excused';

@Schema({ _id: false })
class AttendanceRecord {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  student: Types.ObjectId;

  @Prop({ type: String, enum: ['present', 'absent', 'excused'], default: 'present' })
  status: AttendanceStatus;

  @Prop({ trim: true, maxlength: 200, default: '' })
  note: string;
}

const AttendanceRecordSchema = SchemaFactory.createForClass(AttendanceRecord);

@Schema({ timestamps: true })
export class Attendance {
  @Prop({ type: Types.ObjectId, ref: 'Circle', required: true })
  circle: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  submittedBy: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1 })
  sessionNumber: number;

  @Prop({ type: Date, required: true })
  sessionDate: Date;

  @Prop({ trim: true, maxlength: 200, default: 'General Session' })
  topic: string;

  @Prop({ type: [AttendanceRecordSchema], default: [] })
  records: AttendanceRecord[];
}

export const AttendanceSchema = SchemaFactory.createForClass(Attendance);
