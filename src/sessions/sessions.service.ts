import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Attendance, AttendanceDocument } from '../attendance/attendance.schema';
import { Circle, CircleDocument } from '../circle/circle.schema';

const CURRICULUM_MAP: Record<number, string> = {
  1: 'Identity', 2: 'Honesty', 3: 'Family', 4: 'Gratitude',
  5: 'Courage', 6: 'Friendship', 7: 'Patience', 8: 'Generosity',
  9: 'Body', 10: 'Knowledge', 11: 'Community', 12: 'Legacy',
};

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Attendance.name) private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Circle.name)     private readonly circleModel:     Model<CircleDocument>,
  ) {}

  async getStats() {
    const [sessions, activeCircles] = await Promise.all([
      this.attendanceModel.find().select('sessionNumber records').lean(),
      this.circleModel.countDocuments({ isActive: true }),
    ]);

    const uniqueSessionNumbers = new Set(sessions.map((s) => s.sessionNumber));
    const sessionsCompleted    = uniqueSessionNumbers.size;

    let totalPresent = 0;
    let totalRecords = 0;
    for (const s of sessions) {
      for (const r of s.records) {
        totalRecords++;
        if (r.status === 'present') totalPresent++;
      }
    }
    const avgAttendance = totalRecords > 0
      ? Math.round((totalPresent / totalRecords) * 100)
      : 0;

    const currentMonth = new Date().getMonth() + 1;
    const currentTheme = CURRICULUM_MAP[currentMonth] ?? '—';

    return {
      sessionsCompleted,
      avgAttendance,
      activeCircles,
      currentMonth,
      currentTheme,
      totalSessions: 40,
    };
  }

  async getAllSessions() {
    const sessions = await this.attendanceModel
      .find()
      .populate('circle', 'name')
      .populate('submittedBy', 'fullName')
      .sort({ sessionDate: -1, sessionNumber: -1 })
      .lean();

    return sessions.map((s) => {
      const present = s.records.filter((r) => r.status === 'present').length;
      const total   = s.records.length;
      return {
        _id          : s._id,
        sessionNumber: s.sessionNumber,
        sessionDate  : s.sessionDate,
        topic        : s.topic,
        circle       : s.circle,
        submittedBy  : s.submittedBy,
        present,
        total,
        attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
      };
    });
  }
}
