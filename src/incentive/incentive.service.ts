import { ForbiddenException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IsEnum, IsMongoId, IsOptional, IsString, MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  Incentive, IncentiveDocument,
  AwardType, AWARD_POINTS,
} from './incentive.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { Attendance, AttendanceDocument } from '../attendance/attendance.schema';
import { User, UserDocument, UserRole } from '../user/user.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';
import { safeTrim } from '../common/utils/transform.util';
import { currentMonth, monthRange } from '../common/utils/month.util';
import { attendanceTotals } from '../attendance/attendance-stats';

export class AwardPointsDto {
  @IsMongoId({ message: 'Invalid student ID.' })
  studentId: string;

  @IsEnum(['noor-star', 'circle-champion', 'sadaqah-hero', 'knowledge-seeker', 'kindness-award', 'courage-award'],
    { message: 'Invalid award type.' })
  awardType: AwardType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(safeTrim)
  note?: string;
}

@Injectable()
export class IncentiveService {
  constructor(
    @InjectModel(Incentive.name)   private readonly incentiveModel:   Model<IncentiveDocument>,
    @InjectModel(Student.name)     private readonly studentModel:     Model<StudentDocument>,
    @InjectModel(Attendance.name)  private readonly attendanceModel:  Model<AttendanceDocument>,
    @InjectModel(User.name)        private readonly userModel:        Model<UserDocument>,
    @InjectModel(Circle.name)      private readonly circleModel:      Model<CircleDocument>,
  ) {}

  /**
   * For murabbi requesters, confirms the student is actually assigned to
   * them (admins bypass). Same class of gap as attendance.service.ts had:
   * award() and getByStudent() below previously let any murabbi award
   * points to, or view the incentive history of, any student system-wide.
   */
  private async assertStudentOwnership(studentId: string, requesterId: string, requesterRole?: string) {
    const student = await this.studentModel.findById(studentId).lean();
    if (!student) throw new NotFoundException('Student not found.');
    // 403 like attendance does for the same check (BUG-36).
    if (requesterRole === 'murabbi' && student.murabbi?.toString() !== requesterId) {
      throw new ForbiddenException('This student is not assigned to you.');
    }
    return student;
  }

  async award(awardedById: string, dto: AwardPointsDto, requesterRole?: string) {
    const student = await this.assertStudentOwnership(dto.studentId, awardedById, requesterRole);
    if (!student.isActive) throw new BadRequestException('Points can only be awarded to active students.'); // BUG-37

    const points = AWARD_POINTS[dto.awardType];
    if (!points) throw new BadRequestException('Invalid award type.');

    const incentive = await this.incentiveModel.create({
      student   : new Types.ObjectId(dto.studentId),
      awardType : dto.awardType,
      points,
      awardedBy : new Types.ObjectId(awardedById),
      note      : dto.note ?? '',
    });

    return { message: 'Points awarded successfully.', incentive };
  }

  async getAll() {
    return this.incentiveModel
      .find()
      .populate('student', 'fullName')
      .populate('awardedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean();
  }

  async getLeaderboard() {
    // Aggregate total points per student, then join student + circle data
    const results = await this.incentiveModel.aggregate([
      {
        $group: {
          _id       : '$student',
          noorPoints: { $sum: '$points' },
        },
      },
      { $sort: { noorPoints: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from        : 'students',
          localField  : '_id',
          foreignField: '_id',
          as          : 'studentDoc',
        },
      },
      { $unwind: '$studentDoc' },
      {
        $lookup: {
          from        : 'circles',
          localField  : 'studentDoc.circle',
          foreignField: '_id',
          as          : 'circleDoc',
        },
      },
      {
        $project: {
          _id       : '$studentDoc._id',
          fullName  : '$studentDoc.fullName',
          noorPoints: 1,
          circle    : { $arrayElemAt: ['$circleDoc', 0] },
        },
      },
    ]);

    return results.map((r) => ({
      _id       : r._id,
      fullName  : r.fullName,
      noorPoints: r.noorPoints,
      circle    : r.circle ? { name: r.circle.name } : null,
    }));
  }

  async getByStudent(studentId: string, requesterId?: string, requesterRole?: string) {
    if (requesterId) {
      await this.assertStudentOwnership(studentId, requesterId, requesterRole);
    }
    const records = await this.incentiveModel
      .find({ student: new Types.ObjectId(studentId) })
      .populate('awardedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean();

    const totalPoints = records.reduce((sum, r) => sum + r.points, 0);
    return { totalPoints, records };
  }

  async getPageData() {
    const month          = currentMonth();
    const { start, end } = monthRange(month);
    const [leaderboard, allIncentives, attMap, murabbis, allCircles] = await Promise.all([
      this.getLeaderboard(),
      this.incentiveModel.find().lean(),
      attendanceTotals(this.attendanceModel, { sessionDate: { $gte: start, $lt: end } }, 'submittedBy'),
      this.userModel.find({ role: UserRole.MURABBI, isEmailVerified: true, isActive: true })
        .select('fullName email image').lean(),
      this.circleModel.find().select('name murabbi').lean(),
    ]);

    // ── Award breakdown by type ─────────────────────────────────────────────
    const breakdown: Record<string, { count: number; totalPts: number }> = {};
    for (const inc of allIncentives) {
      if (!breakdown[inc.awardType]) breakdown[inc.awardType] = { count: 0, totalPts: 0 };
      breakdown[inc.awardType].count++;
      breakdown[inc.awardType].totalPts += inc.points;
    }
    const totalPointsAwarded = allIncentives.reduce((s, i) => s + i.points, 0);

    // ── Murabbi of the Month — highest attendance this (Pakistan) month ──────
    // Only murabbis who actually recorded sessions this month qualify; with no
    // data there is no winner (previously someone "won" at 0%, or on all-time
    // data labelled as this month).
    const monthLabel = start.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' });

    let bestMurabbi: any = null;
    let bestRate = -1;
    for (const m of murabbis) {
      const mid = m._id.toString();
      const att = attMap.get(mid);
      if (!att || att.total === 0) continue;
      const rate = att.present / att.total;
      if (rate > bestRate) {
        bestRate = rate;
        const circle = allCircles.find((c) => c.murabbi?.toString() === mid);
        bestMurabbi = {
          _id      : m._id,
          fullName : m.fullName,
          image    : m.image,
          circle   : circle ? circle.name : null,
          attRate  : Math.round(rate * 100),
          month    : monthLabel,
        };
      }
    }

    return {
      leaderboard      : leaderboard.slice(0, 10),
      murabbiOfMonth   : bestMurabbi,
      breakdown,
      totalPointsAwarded,
      currentMonth,
    };
  }
}
