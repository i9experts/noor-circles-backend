import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attendance, AttendanceDocument } from '../attendance/attendance.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';
import { Incentive, IncentiveDocument } from '../incentive/incentive.schema';

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Attendance.name) private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Student.name)    private readonly studentModel:    Model<StudentDocument>,
    @InjectModel(Circle.name)     private readonly circleModel:     Model<CircleDocument>,
    @InjectModel(Incentive.name)  private readonly incentiveModel:  Model<IncentiveDocument>,
  ) {}

  async getMurabbiReport(murabbiId: string) {
    const circles = await this.circleModel
      .find({ murabbi: new Types.ObjectId(murabbiId) })
      .select('_id name')
      .lean();

    const circleIds = circles.map((c) => c._id);

    const [totalStudents, sessions] = await Promise.all([
      circleIds.length ? this.studentModel.countDocuments({ circle: { $in: circleIds }, isActive: true }) : 0,
      circleIds.length ? this.attendanceModel.find({ circle: { $in: circleIds } }).lean() : [],
    ]);

    const sessionsCompleted = sessions.length;

    // Compute average attendance rate
    let totalPresent = 0;
    let totalRecords = 0;
    for (const session of sessions) {
      for (const rec of session.records) {
        totalRecords++;
        if (rec.status === 'present') totalPresent++;
      }
    }
    const avgAttendanceRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;

    // Build recent reports list (one entry per circle)
    const reports = circles.map((c) => {
      const circleSessions = sessions.filter((s) => s.circle.toString() === c._id.toString());
      return {
        id  : c._id,
        name: `${c.name} — Session Report`,
        date: new Date().toLocaleDateString('en-PK'),
        type: 'Attendance',
        status: circleSessions.length > 0 ? 'Generated' : 'Pending',
      };
    });

    const visualInsights = {
      studentEngagement : avgAttendanceRate,
      curriculumCompletion: 0,
      parentFeedbackScore : '0.0',
    };

    return {
      summary: {
        totalStudents,
        sessionsCompleted,
        avgAttendanceRate,
        totalPointsAwarded: 0,
      },
      reports,
      visualInsights,
    };
  }

  async getAdminReport() {
    const [
      totalStudents,
      activeCircles,
      sessions,
      incentiveBreakdown,
      monthlyEnrollments,
    ] = await Promise.all([
      this.studentModel.countDocuments({ isActive: true }),
      this.circleModel.countDocuments({ isActive: true }),
      this.attendanceModel.find().select('records').lean(),
      this.incentiveModel.aggregate([
        {
          $group: {
            _id        : '$awardType',
            count      : { $sum: 1 },
            totalPoints: { $sum: '$points' },
          },
        },
        { $sort: { totalPoints: -1 } },
      ]),
      this.studentModel.aggregate([
        {
          $group: {
            _id  : { year: { $year: '$enrollmentDate' }, month: { $month: '$enrollmentDate' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $limit: 6 },
      ]),
    ]);

    let totalPresent = 0;
    let totalRecords = 0;
    for (const session of sessions) {
      for (const rec of session.records) {
        totalRecords++;
        if (rec.status === 'present') totalPresent++;
      }
    }
    const avgAttendanceRate = totalRecords > 0
      ? Math.round((totalPresent / totalRecords) * 100)
      : 0;

    const totalIncentivesAwarded = incentiveBreakdown.reduce(
      (sum: number, i: any) => sum + i.count, 0,
    );

    return {
      overview: {
        totalStudents,
        activeCircles,
        totalSessions   : sessions.length,
        avgAttendanceRate,
        totalIncentivesAwarded,
      },
      incentiveBreakdown,
      monthlyEnrollments,
    };
  }

  async getAttendanceTrendPerCircle() {
    const circles = await this.circleModel
      .find({ isActive: true })
      .select('_id name murabbi')
      .populate('murabbi', 'fullName')
      .lean();

    const results = await Promise.all(
      circles.map(async (circle) => {
        const sessions = await this.attendanceModel
          .find({ circle: circle._id })
          .sort({ sessionNumber: 1 })
          .lean();

        const sessionMap = new Map<number, { present: number; total: number }>();
        for (const s of sessions) {
          const present = s.records.filter((r) => r.status === 'present').length;
          const total   = s.records.length;
          if (!sessionMap.has(s.sessionNumber)) {
            sessionMap.set(s.sessionNumber, { present: 0, total: 0 });
          }
          const entry = sessionMap.get(s.sessionNumber)!;
          entry.present += present;
          entry.total   += total;
        }

        const sessionData = [...sessionMap.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([sessionNumber, data]) => ({
            sessionNumber,
            attendanceRate: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
            present: data.present,
            total  : data.total,
          }));

        const avgRate = sessionData.length > 0
          ? Math.round(sessionData.reduce((sum, p) => sum + p.attendanceRate, 0) / sessionData.length)
          : 0;

        return {
          circleId    : (circle._id as Types.ObjectId).toString(),
          circleName  : circle.name,
          murabbiName : (circle.murabbi as any)?.fullName ?? null,
          sessions    : sessionData,
          avgRate,
          sessionCount: sessionData.length,
          bestRate    : sessionData.length > 0 ? Math.max(...sessionData.map((s) => s.attendanceRate)) : 0,
        };
      }),
    );

    return results;
  }

  async getCircleDetail(circleId: string) {
    const circle = await this.circleModel
      .findById(circleId)
      .populate('murabbi', 'fullName email')
      .populate('neighbourhood', 'name city')
      .lean();
    if (!circle) throw new NotFoundException('Circle not found.');

    const [students, sessions] = await Promise.all([
      this.studentModel
        .find({ circle: new Types.ObjectId(circleId), isActive: true })
        .select('fullName fatherName phone')
        .lean(),
      this.attendanceModel
        .find({ circle: new Types.ObjectId(circleId) })
        .sort({ sessionNumber: 1 })
        .lean(),
    ]);

    // per-session stats
    const sessionData = sessions.map((s) => {
      const present = s.records.filter((r) => r.status === 'present').length;
      const absent  = s.records.filter((r) => r.status === 'absent').length;
      const total   = s.records.length;
      return {
        sessionNumber  : s.sessionNumber,
        sessionDate    : s.sessionDate,
        topic          : (s as any).topic || '—',
        present,
        absent,
        total,
        attendanceRate : total > 0 ? Math.round((present / total) * 100) : 0,
      };
    });

    // per-student attendance rate
    const studentStats = students.map((student) => {
      let present = 0, total = 0;
      for (const s of sessions) {
        const rec = s.records.find(
          (r) => r.student.toString() === (student._id as Types.ObjectId).toString(),
        );
        if (rec) { total++; if (rec.status === 'present') present++; }
      }
      return {
        fullName      : student.fullName,
        fatherName    : (student as any).fatherName || '—',
        phone         : (student as any).phone || '—',
        present,
        total,
        attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
      };
    });

    const totalPresent = sessionData.reduce((s, x) => s + x.present, 0);
    const totalRecords = sessionData.reduce((s, x) => s + x.total, 0);

    return {
      circle,
      students : studentStats,
      sessions : sessionData,
      summary  : {
        totalStudents    : students.length,
        sessionsCompleted: sessions.length,
        avgAttendanceRate: totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0,
        totalPresent,
        totalAbsent      : totalRecords - totalPresent,
      },
      generatedAt: new Date(),
    };
  }

  async getAttendanceTrend(circleId?: string, murabbiId?: string) {
    let filter: any = {};

    if (circleId) {
      filter = { circle: new Types.ObjectId(circleId) };
    } else if (murabbiId) {
      const circleIds = (
        await this.circleModel
          .find({ murabbi: new Types.ObjectId(murabbiId) })
          .select('_id')
          .lean()
      ).map((c) => c._id);
      filter = { circle: { $in: circleIds } };
    }

    const sessions = await this.attendanceModel
      .find(filter)
      .sort({ sessionNumber: 1, sessionDate: 1 })
      .lean();

    // Aggregate by session number — sum present/total across all matching circles
    const sessionMap = new Map<number, { totalPresent: number; totalRecords: number; date: Date }>();

    for (const s of sessions) {
      const present = s.records.filter((r) => r.status === 'present').length;
      const total   = s.records.length;

      if (!sessionMap.has(s.sessionNumber)) {
        sessionMap.set(s.sessionNumber, { totalPresent: 0, totalRecords: 0, date: s.sessionDate });
      }
      const entry = sessionMap.get(s.sessionNumber)!;
      entry.totalPresent += present;
      entry.totalRecords += total;
    }

    return [...sessionMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([sessionNumber, data]) => ({
        sessionNumber,
        sessionDate   : data.date,
        attendanceRate: data.totalRecords > 0 ? Math.round((data.totalPresent / data.totalRecords) * 100) : 0,
        present       : data.totalPresent,
        total         : data.totalRecords,
      }));
  }
}
