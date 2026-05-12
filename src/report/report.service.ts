import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attendance, AttendanceDocument } from '../attendance/attendance.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Attendance.name) private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Student.name)    private readonly studentModel:    Model<StudentDocument>,
    @InjectModel(Circle.name)     private readonly circleModel:     Model<CircleDocument>,
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
    const [totalStudents, totalCircles, sessions] = await Promise.all([
      this.studentModel.countDocuments(),
      this.circleModel.countDocuments(),
      this.attendanceModel.find().lean(),
    ]);

    let totalPresent = 0;
    let totalRecords = 0;
    for (const session of sessions) {
      for (const rec of session.records) {
        totalRecords++;
        if (rec.status === 'present') totalPresent++;
      }
    }
    const avgAttendanceRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;

    return {
      summary: {
        totalStudents,
        totalCircles,
        totalSessions: sessions.length,
        avgAttendanceRate,
      },
    };
  }

  async getAttendanceTrend(murabbiId?: string) {
    const filter: any = murabbiId
      ? { circle: { $in: (await this.circleModel.find({ murabbi: new Types.ObjectId(murabbiId) }).select('_id').lean()).map((c) => c._id) } }
      : {};

    const sessions = await this.attendanceModel.find(filter).sort({ sessionDate: 1 }).lean();

    return sessions.map((s) => {
      const total   = s.records.length;
      const present = s.records.filter((r) => r.status === 'present').length;
      return {
        sessionNumber: s.sessionNumber,
        sessionDate  : s.sessionDate,
        attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
      };
    });
  }
}
