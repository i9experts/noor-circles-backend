import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attendance, AttendanceDocument } from './attendance.schema';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(Attendance.name)
    private readonly attendanceModel: Model<AttendanceDocument>,
  ) {}

  // ── Submit ────────────────────────────────────────────────────────────────────

  async submit(
    murabbiId: string,
    dto: {
      circle: string;
      sessionNumber: number;
      sessionDate: string;
      topic?: string;
      records: { student: string; status: string; note?: string }[];
    },
  ) {
    if (!dto.records?.length) throw new BadRequestException('records cannot be empty');

    const existing = await this.attendanceModel.findOne({
      circle       : new Types.ObjectId(dto.circle),
      sessionNumber: dto.sessionNumber,
    });
    if (existing) {
      throw new ConflictException(
        `Attendance for session #${dto.sessionNumber} in this circle has already been submitted.`,
      );
    }

    return this.attendanceModel.create({
      circle       : new Types.ObjectId(dto.circle),
      submittedBy  : new Types.ObjectId(murabbiId),
      sessionNumber: dto.sessionNumber,
      sessionDate  : new Date(dto.sessionDate),
      topic        : dto.topic || 'General Session',
      records      : dto.records.map((r) => ({
        student: new Types.ObjectId(r.student),
        status : r.status || 'present',
        note   : r.note || '',
      })),
    });
  }

  // ── Read ──────────────────────────────────────────────────────────────────────

  async getAll() {
    return this.attendanceModel
      .find()
      .populate('circle', 'name')
      .populate('submittedBy', 'fullName email')
      .populate('records.student', 'fullName age')
      .sort({ sessionDate: -1 })
      .lean();
  }

  async getById(id: string) {
    const doc = await this.attendanceModel
      .findById(id)
      .populate('circle', 'name')
      .populate('submittedBy', 'fullName email')
      .populate('records.student', 'fullName age')
      .lean();
    if (!doc) throw new NotFoundException('Attendance record not found.');
    return doc;
  }

  async getByCircle(circleId: string) {
    return this.attendanceModel
      .find({ circle: new Types.ObjectId(circleId) })
      .populate('submittedBy', 'fullName')
      .populate('records.student', 'fullName')
      .sort({ sessionDate: -1 })
      .lean();
  }

  async getByMurabbi(murabbiId: string) {
    return this.attendanceModel
      .find({ submittedBy: new Types.ObjectId(murabbiId) })
      .populate('circle', 'name')
      .populate('records.student', 'fullName age')
      .sort({ sessionDate: -1 })
      .lean();
  }

  async getByStudent(studentId: string) {
    const sessions = await this.attendanceModel
      .find({ 'records.student': new Types.ObjectId(studentId) })
      .populate('circle', 'name')
      .populate('submittedBy', 'fullName')
      .sort({ sessionDate: -1 })
      .lean();

    return sessions.map((s) => {
      const rec = s.records.find((r) => r.student.toString() === studentId);
      return {
        _id          : s._id,
        circle       : s.circle,
        submittedBy  : s.submittedBy,
        sessionNumber: s.sessionNumber,
        sessionDate  : s.sessionDate,
        topic        : s.topic,
        totalStudents: s.records.length,
        status       : rec?.status ?? 'absent',
        note         : rec?.note  ?? '',
      };
    });
  }

  async getStudentRate(studentId: string) {
    const all = await this.attendanceModel
      .find({ 'records.student': new Types.ObjectId(studentId) })
      .lean();

    const total = all.length;
    if (!total) return { total: 0, present: 0, absent: 0, excused: 0, rate: 0 };

    let present = 0, absent = 0, excused = 0;
    for (const session of all) {
      const rec = session.records.find((r) => r.student.toString() === studentId);
      if      (rec?.status === 'present') present++;
      else if (rec?.status === 'excused') excused++;
      else    absent++;
    }
    return { total, present, absent, excused, rate: Math.round((present / total) * 100) };
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: {
      sessionNumber?: number;
      sessionDate?  : string;
      topic?        : string;
      records?      : { student: string; status: string; note?: string }[];
    },
  ) {
    const patch: Record<string, unknown> = {};
    if (dto.topic         !== undefined) patch.topic         = dto.topic;
    if (dto.sessionDate   !== undefined) patch.sessionDate   = new Date(dto.sessionDate);
    if (dto.sessionNumber !== undefined) patch.sessionNumber = dto.sessionNumber;
    if (dto.records       !== undefined) {
      patch.records = dto.records.map((r) => ({
        student: new Types.ObjectId(r.student),
        status : r.status,
        note   : r.note || '',
      }));
    }

    const doc = await this.attendanceModel
      .findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true })
      .populate('circle', 'name')
      .populate('submittedBy', 'fullName email')
      .populate('records.student', 'fullName age')
      .lean();

    if (!doc) throw new NotFoundException('Attendance record not found.');
    return doc;
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async remove(id: string) {
    const doc = await this.attendanceModel.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('Attendance record not found.');
    return { message: 'Attendance record deleted.' };
  }
}