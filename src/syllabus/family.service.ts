import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import { Parent, ParentDocument } from '../parent/parent.schema';
import { Student, StudentDocument } from '../student/student.schema';
import { Attendance, AttendanceDocument } from '../attendance/attendance.schema';
import { Incentive, IncentiveDocument, AWARD_POINTS } from '../incentive/incentive.schema';
import { Circle } from '../circle/circle.schema';
import {
  SessionCoverage, SessionCoverageDocument, StudentNote, StudentNoteDocument, SyllabusSession,
  SyllabusSessionDocument, THEMES,
} from './syllabus.schema';
import { SyllabusService } from './syllabus.service';
import { addDays, pkToday } from './schedule.util';
import { EmailService } from '../email/email.service';

const AWARD_LABELS: Record<string, string> = {
  'noor-star'       : 'Noor Star',
  'circle-champion' : 'Circle Champion',
  'sadaqah-hero'    : 'Sadaqah Hero',
  'knowledge-seeker': 'Knowledge Seeker',
  'kindness-award'  : 'Kindness Award',
  'courage-award'   : 'Courage Award',
};

const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || '';

/**
 * Private, password-free family links. A link is `<parentId>.<version>.<sig>`
 * where sig is an HMAC of the first two parts, so nothing secret is stored;
 * bumping the parent's familyLinkVersion revokes every older link.
 */
@Injectable()
export class FamilyService {
  private readonly secret: string;
  private readonly portalUrl: string;

  constructor(
    config: ConfigService,
    @InjectModel(Parent.name)          private readonly parentModel:     Model<ParentDocument>,
    @InjectModel(Student.name)         private readonly studentModel:    Model<StudentDocument>,
    @InjectModel(Attendance.name)      private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Incentive.name)       private readonly incentiveModel:  Model<IncentiveDocument>,
    @InjectModel(SyllabusSession.name) private readonly sessionModel:    Model<SyllabusSessionDocument>,
    @InjectModel(SessionCoverage.name) private readonly coverageModel:   Model<SessionCoverageDocument>,
    @InjectModel(StudentNote.name)     private readonly noteModel:       Model<StudentNoteDocument>,
    private readonly syllabus: SyllabusService,
    private readonly email: EmailService,
  ) {
    // A dedicated secret if set; otherwise one derived from the JWT secret.
    this.secret = config.get<string>('FAMILY_LINK_SECRET')
      || createHmac('sha256', config.getOrThrow<string>('JWT_ACCESS_SECRET')).update('family-link').digest('hex');
    this.portalUrl = (config.get<string>('PORTAL_URL')
      || (config.get<string>('FRONTEND_URL') || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, '');
  }

  private sign(parentId: string, version: number) {
    return createHmac('sha256', this.secret).update(`${parentId}.${version}`).digest('base64url').slice(0, 32);
  }

  private tokenFor(parentId: string, version: number) {
    return `${parentId}.${version}.${this.sign(parentId, version)}`;
  }

  private urlFor(parentId: string, version: number) {
    return `${this.portalUrl}/family/${this.tokenFor(parentId, version)}`;
  }

  async getLink(parentId: string) {
    const p = await this.parentModel.findById(parentId).select('fullName familyLinkVersion familyLinkLastViewedAt').lean();
    if (!p) throw new NotFoundException('Parent not found.');
    return { url: this.urlFor(p._id.toString(), p.familyLinkVersion ?? 1), lastViewedAt: p.familyLinkLastViewedAt ?? null };
  }

  async rotateLink(parentId: string) {
    const p = await this.parentModel.findByIdAndUpdate(parentId, { $inc: { familyLinkVersion: 1 } }, { new: true })
      .select('familyLinkVersion').lean();
    if (!p) throw new NotFoundException('Parent not found.');
    return { message: 'New link created. The old link no longer works.', url: this.urlFor(p._id.toString(), p.familyLinkVersion) };
  }

  private async parentFromToken(token: string) {
    const invalid = new NotFoundException('This link is not valid. Please ask the Noor Circles team for a new one.');
    const m = /^([a-f\d]{24})\.(\d{1,6})\.([A-Za-z0-9_-]{32})$/i.exec(token ?? '');
    if (!m) throw invalid;
    const [, id, v, sig] = m;
    const expected = Buffer.from(this.sign(id, Number(v)));
    if (expected.length !== sig.length || !timingSafeEqual(expected, Buffer.from(sig))) throw invalid;
    const parent = await this.parentModel.findById(id).select('fullName students familyLinkVersion').lean();
    if (!parent || (parent.familyLinkVersion ?? 1) !== Number(v)) throw invalid;
    return parent;
  }

  /**
   * The welcome email for a family: their child(ren)'s circle, murabbi and
   * meeting time, and the private family page link. Sent once per address.
   */
  async sendWelcome(parentId: string) {
    const p = await this.parentModel.findById(parentId).select('fullName email students familyLinkVersion account').lean();
    if (!p?.email) return 'skipped';
    const students = await this.studentModel.find({ _id: { $in: p.students }, isActive: true })
      .populate({ path: 'circle', select: 'name meetingDay meetingTime murabbi', populate: { path: 'murabbi', select: 'fullName' } })
      .select('fullName circle').lean();
    if (!students.length) return 'skipped';
    const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    const time = (t?: string | null) => {
      if (!t) return '';
      const [h, m] = t.split(':').map(Number);
      return `, ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
    };
    const children = students.map((s) => {
      const c = s.circle as any;
      return {
        name: s.fullName.split(' ')[0],
        circle: c?.name ?? '',
        murabbi: c?.murabbi?.fullName ?? '',
        schedule: c?.meetingDay != null ? `${DAYS[c.meetingDay]}${time(c.meetingTime)}` : '',
      };
    });
    return this.email.queue('family.welcome', { email: p.email, name: p.fullName, userId: p.account ?? null }, {
      children, familyUrl: this.urlFor(p._id.toString(), p.familyLinkVersion ?? 1), hasAccount: !!p.account, loginUrl: this.email.link('/signin'),
    }, { dedupeKey: `family-welcome:${p._id.toString()}:${p.email}` });
  }

  /** Everything a family sees on their page. */
  async view(token: string) {
    const parent = await this.parentFromToken(token);
    this.parentModel.updateOne({ _id: parent._id }, { $set: { familyLinkLastViewedAt: new Date() } }).catch(() => {});
    return this.build(parent);
  }

  /** The same page for a parent signed in with their own account. */
  async viewForAccount(userId: string, accountName: string) {
    const parent = await this.parentModel.findOne({ account: new Types.ObjectId(userId) }).select('fullName students').lean();
    if (!parent) throw new NotFoundException('We couldn’t find your family record. Please contact the Noor Circles team.');
    // Greet them by their own name (the record may have been entered as e.g. "Parent of Ahmed").
    return this.build({ ...parent, fullName: accountName || parent.fullName });
  }

  private async build(parent: { _id: Types.ObjectId; fullName: string; students: Types.ObjectId[] }) {

    const students = await this.studentModel.find({ _id: { $in: parent.students }, isActive: true })
      .populate({ path: 'circle', populate: [{ path: 'murabbi', select: 'fullName' }, { path: 'track', select: 'name ageGroup' }, { path: 'neighbourhood', select: 'name' }] })
      .select('fullName circle').sort({ fullName: 1 }).lean();

    const circles = new Map<string, any>();
    for (const s of students) if (s.circle) circles.set((s.circle as any)._id.toString(), s.circle);
    const circleList = [...circles.values()];
    const closures = await this.syllabus.closuresByCircle(circleList.map((c) => c._id));
    const progress = new Map<string, Awaited<ReturnType<SyllabusService['progressFor']>>>();
    for (const c of circleList) {
      progress.set(c._id.toString(), await this.syllabus.progressFor(
        { ...c, track: c.track?._id ?? null } as Circle & { _id: Types.ObjectId }, closures.get(c._id.toString()) ?? []));
    }

    const today = pkToday();
    const calendar = circleList.length
      ? await this.syllabus.calendarFor(circleList.map((c) => ({ ...c, track: c.track?._id ?? null })), today, addDays(today, 56))
      : [];

    const children = await Promise.all(students.map(async (s) => {
      const circle = s.circle as any;
      const cid = circle?._id?.toString();
      const p = cid ? progress.get(cid) : null;
      const [sessions, incentives, notes, lastCoverage] = await Promise.all([
        this.attendanceModel.find({ 'records.student': s._id }).select('sessionDate sessionNumber topic records')
          .sort({ sessionDate: -1 }).limit(52).lean(),
        this.incentiveModel.find({ student: s._id }).select('awardType points createdAt').sort({ createdAt: -1 }).lean(),
        this.noteModel.find({ student: s._id }).populate('author', 'fullName').select('note createdAt author')
          .sort({ createdAt: -1 }).limit(5).lean(),
        cid ? this.coverageModel.findOne({ circle: circle._id, completed: true }).sort({ date: -1 }).lean() : null,
      ]);

      const history = sessions.map((a) => ({
        date: a.sessionDate, sessionNumber: a.sessionNumber, topic: a.topic,
        status: a.records.find((r) => r.student.toString() === s._id.toString())?.status ?? 'absent',
      }));
      const present = history.filter((h) => h.status === 'present').length;
      const lastSession = lastCoverage ? await this.sessionModel.findById(lastCoverage.session).lean() : null;
      const nextSession = p?.current ? await this.sessionModel.findById(p.current._id).select('number title month homeActivity').lean() : null;
      const nextDate = calendar.find((i) => i.type === 'session' && i.circleId?.toString() === cid)?.date ?? null;

      return {
        _id: s._id,
        fullName: s.fullName,
        circle: circle && {
          name: circle.name, neighbourhood: circle.neighbourhood?.name ?? null,
          meetingDay: circle.meetingDay, meetingTime: circle.meetingTime,
          murabbi: firstName(circle.murabbi?.fullName), track: circle.track?.name ?? null,
        },
        attendance: {
          present, total: history.length,
          rate: history.length ? Math.round((present / history.length) * 100) : null,
          recent: history.slice(0, 8),
        },
        points: {
          total: incentives.reduce((t, i) => t + i.points, 0),
          recent: incentives.slice(0, 5).map((i) => ({ award: AWARD_LABELS[i.awardType] ?? i.awardType, points: i.points ?? AWARD_POINTS[i.awardType], date: (i as any).createdAt })),
        },
        thisWeek: lastSession && {
          number: lastSession.number, title: lastSession.title, theme: THEMES[lastSession.month - 1],
          date: lastCoverage.date, homeActivity: lastSession.homeActivity,
          objectives: lastSession.objectives,
        },
        next: nextSession && {
          number: nextSession.number, title: nextSession.title, theme: THEMES[nextSession.month - 1], date: nextDate,
        },
        progress: p && { covered: p.covered, total: p.total },
        notes: notes.map((n) => ({ note: n.note, date: (n as any).createdAt, from: firstName((n.author as any)?.fullName) })),
      };
    }));

    return {
      family  : { name: parent.fullName },
      children,
      calendar: calendar.map((i) => ({
        type: i.type, date: i.date, endDate: i.endDate, time: i.time, title: i.title, circleName: i.circleName,
        sessionNumber: i.sessionNumber, notes: i.notes, cancelsSessions: i.cancelsSessions,
      })),
    };
  }
}
