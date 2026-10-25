import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attendance, AttendanceDocument } from './attendance.schema';
import { Circle, CircleDocument }   from '../circle/circle.schema';
import { Student, StudentDocument } from '../student/student.schema';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(Attendance.name)
    private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Circle.name)
    private readonly circleModel: Model<CircleDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
  ) {}

  /**
   * Confirms a circle exists and — for murabbi requesters — that it's
   * actually assigned to them. Admins bypass the ownership check.
   * Previously unchecked: any authenticated murabbi could submit
   * attendance for, or read attendance/rates from, any circle or
   * student in the system regardless of assignment.
   */
  private async assertCircleOwnership(circleId: string, requesterId: string, requesterRole?: string) {
    const circle = await this.circleModel.findById(circleId).lean();
    if (!circle) throw new NotFoundException('Circle not found.');
    if (requesterRole === 'murabbi' && circle.murabbi.toString() !== requesterId) {
      throw new ForbiddenException('This circle is not assigned to you.');
    }
    return circle;
  }

  private async assertStudentOwnership(studentId: string, requesterId: string, requesterRole?: string) {
    const student = await this.studentModel.findById(studentId).lean();
    if (!student) throw new NotFoundException('Student not found.');
    if (requesterRole === 'murabbi' && student.murabbi?.toString() !== requesterId) {
      throw new ForbiddenException('This student is not assigned to you.');
    }
    return student;
  }

  /**
   * Every record must be a distinct student of this circle (BUG-23):
   * otherwise a murabbi could mark other circles' students, or the same
   * child twice, and corrupt attendance rates and reports.
   */
  private async assertRecordsBelongToCircle(circleId: string, records: { student: string }[]) {
    const ids = records.map((r) => String(r.student));
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Each student can appear only once in a session.');
    }
    if (ids.some((id) => !Types.ObjectId.isValid(id))) {
      throw new BadRequestException('Invalid student id in records.');
    }
    const inCircle = await this.studentModel.countDocuments({
      _id   : { $in: ids.map((id) => new Types.ObjectId(id)) },
      circle: new Types.ObjectId(circleId),
    });
    if (inCircle !== ids.length) {
      throw new BadRequestException('Attendance can only include students of this circle.');
    }
  }

  private dayBounds(date: string | Date) {
    const dayStart = new Date(date); dayStart.setHours(0,  0,  0,   0);
    const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);
    return { dayStart, dayEnd };
  }

  /** One session per circle per day, and session numbers unique per circle. */
  private async assertNoClash(circleId: string, sessionDate: string | Date | undefined, sessionNumber: number | undefined, excludeId?: string) {
    const circle = new Types.ObjectId(circleId);
    const notSelf = excludeId ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {};
    if (sessionDate !== undefined) {
      const { dayStart, dayEnd } = this.dayBounds(sessionDate);
      if (await this.attendanceModel.exists({ circle, sessionDate: { $gte: dayStart, $lte: dayEnd }, ...notSelf })) {
        throw new ConflictException(
          `Attendance for this circle on ${new Date(sessionDate).toDateString()} has already been submitted.`,
        );
      }
    }
    if (sessionNumber !== undefined) {
      if (await this.attendanceModel.exists({ circle, sessionNumber, ...notSelf })) {
        throw new ConflictException(`Session ${sessionNumber} has already been recorded for this circle.`);
      }
    }
  }

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
    requesterRole?: string,
  ) {
    if (!dto.records?.length) throw new BadRequestException('records cannot be empty');

    await this.assertCircleOwnership(dto.circle, murabbiId, requesterRole);
    await this.assertRecordsBelongToCircle(dto.circle, dto.records);
    await this.assertNoClash(dto.circle, dto.sessionDate, dto.sessionNumber);

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
      .populate('records.student', 'fullName')
      .sort({ sessionDate: -1 })
      .lean();
  }

  async getById(id: string) {
    const doc = await this.attendanceModel
      .findById(id)
      .populate('circle', 'name')
      .populate('submittedBy', 'fullName email')
      .populate('records.student', 'fullName')
      .lean();
    if (!doc) throw new NotFoundException('Attendance record not found.');
    return doc;
  }

  async getByCircle(circleId: string, requesterId?: string, requesterRole?: string) {
    if (requesterId) {
      await this.assertCircleOwnership(circleId, requesterId, requesterRole);
    }
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
      .populate('records.student', 'fullName')
      .sort({ sessionDate: -1 })
      .lean();
  }

  async getByStudent(studentId: string, requesterId?: string, requesterRole?: string) {
    if (requesterId) {
      await this.assertStudentOwnership(studentId, requesterId, requesterRole);
    }
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

  async getStudentRate(studentId: string, requesterId?: string, requesterRole?: string) {
    if (requesterId) {
      await this.assertStudentOwnership(studentId, requesterId, requesterRole);
    }
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
    requesterId?: string,
    requesterRole?: string,
  ) {
    const session = await this.attendanceModel.findById(id).lean();
    if (!session) throw new NotFoundException('Attendance record not found.');
    // Murabbis may only edit sessions they submitted
    if (requesterRole === 'murabbi' && requesterId && session.submittedBy.toString() !== requesterId) {
      throw new ForbiddenException('You can only edit attendance you submitted.');
    }
    const circleId = session.circle.toString();
    if (dto.records !== undefined) {
      if (!dto.records.length) throw new BadRequestException('records cannot be empty');
      await this.assertRecordsBelongToCircle(circleId, dto.records);
    }
    await this.assertNoClash(circleId, dto.sessionDate, dto.sessionNumber, id);

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
      .populate('records.student', 'fullName')
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
