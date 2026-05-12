import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attendance, AttendanceDocument } from './attendance.schema';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(Attendance.name) private readonly attendanceModel: Model<AttendanceDocument>,
  ) {}

  async submit(murabbiId: string, dto: {
    circle: string;
    sessionNumber: number;
    sessionDate: string;
    topic?: string;
    records: { student: string; status: string; note?: string }[];
  }) {
    if (!dto.records?.length) throw new BadRequestException('records cannot be empty');

    const doc = await this.attendanceModel.create({
      circle      : new Types.ObjectId(dto.circle),
      submittedBy : new Types.ObjectId(murabbiId),
      sessionNumber: dto.sessionNumber,
      sessionDate : new Date(dto.sessionDate),
      topic       : dto.topic || 'General Session',
      records     : dto.records.map((r) => ({
        student: new Types.ObjectId(r.student),
        status : r.status || 'present',
        note   : r.note || '',
      })),
    });
    return doc;
  }

  async getAll() {
    return this.attendanceModel
      .find()
      .populate('circle', 'name')
      .populate('submittedBy', 'fullName email')
      .sort({ sessionDate: -1 })
      .lean();
  }

  async getByCircle(circleId: string) {
    return this.attendanceModel
      .find({ circle: new Types.ObjectId(circleId) })
      .sort({ sessionDate: -1 })
      .lean();
  }

  async getStudentRate(studentId: string) {
    const all = await this.attendanceModel
      .find({ 'records.student': new Types.ObjectId(studentId) })
      .lean();

    const total = all.length;
    if (!total) return { total: 0, present: 0, absent: 0, rate: 0 };

    let present = 0;
    let absent  = 0;
    for (const session of all) {
      const rec = session.records.find(
        (r) => r.student.toString() === studentId,
      );
      if (rec?.status === 'present') present++;
      else absent++;
    }
    return { total, present, absent, rate: Math.round((present / total) * 100) };
  }
}
